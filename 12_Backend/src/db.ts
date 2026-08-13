/**
 * Postgres connection + transaction helper.
 *
 * Two important properties:
 *   1. We use a connection pool (pg.Pool) so requests don't open a fresh socket each time.
 *   2. Every transaction sets `app.user_id` from the verified JWT *before* the
 *      service code can run any SELECT/INSERT/UPDATE. This is what RLS policies
 *      read via `current_setting('app.user_id', true)::uuid` to scope visibility.
 *
 * Why this matters: in pure Postgres (no Supabase/PostgREST), there is no
 * `auth.uid()` magic. The user identity has to be injected per-transaction.
 * If you forget `SET LOCAL app.user_id`, the RLS policies see NULL and return
 * zero rows — that is the desired fail-closed behavior, not a bug.
 */

import pg from "pg";
import type { PoolClient } from "pg";

const { Pool } = pg;

let _pool: pg.Pool | null = null;

export function getPool(connectionString?: string): pg.Pool {
  if (_pool) return _pool;
  const cs = connectionString ?? process.env.DATABASE_URL;
  if (!cs) {
    throw new Error("DATABASE_URL is not set");
  }
  _pool = new Pool({
    connectionString: cs,
    ssl: process.env.PGSSL === "require" ? { rejectUnauthorized: false } : false,
    max: 10,
  });
  return _pool;
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

export type TxnContext = {
  /** Verified user UUID from the JWT. Null only for service-level operations. */
  userId: string | null;
  /** Optional role claim (buyer/seller/admin) for service-layer guards. */
  role?: string | null;
};

/**
 * Run a function inside a single transaction with `app.user_id` set via
 * SET LOCAL. The RLS policies in migrations/0002_rls.sql read this GUC.
 */
export async function withTransaction<T>(
  ctx: TxnContext,
  fn: (client: PoolClient) => Promise<T>,
  connectionString?: string,
): Promise<T> {
  const pool = getPool(connectionString);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (ctx.userId) {
      // SET LOCAL is bound to the transaction and reverts on COMMIT/ROLLBACK.
      // We also set role context for service-layer guards.
      await client.query("SELECT set_config('app.user_id', $1, true)", [ctx.userId]);
      if (ctx.role) {
        await client.query("SELECT set_config('app.user_role', $1, true)", [ctx.role]);
      }
    } else {
      // Anonymous/system context — RLS policies must deny by default.
      await client.query("SELECT set_config('app.user_id', '', true)");
    }
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Run a read-only query without a transaction wrapper. Use this only for
 * queries that don't need a consistent snapshot or `app.user_id`. For any
 * RLS-protected read, prefer withTransaction().
 */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  connectionString?: string,
): Promise<pg.QueryResult<T>> {
  const pool = getPool(connectionString);
  return pool.query<T>(sql, params as never[]);
}
