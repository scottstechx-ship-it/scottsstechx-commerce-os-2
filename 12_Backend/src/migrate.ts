/**
 * Migration runner — applies every .sql file in migrations/ in lexical order.
 *
 * Each file is wrapped in its own transaction so a failure in one file doesn't
 * leave the DB in a half-applied state. We track applied filenames in
 * `schema_migrations` and skip ones already applied (idempotent re-runs).
 *
 * Used by both the server (on boot) and the test bootstrap.
 */

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { PoolClient } from "pg";
import { getPool } from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

export async function runMigrations(connectionString?: string): Promise<string[]> {
  const pool = getPool(connectionString);
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename    text PRIMARY KEY,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )
    `);
    const dir = await readdir(MIGRATIONS_DIR);
    const files = dir.filter((f) => f.endsWith(".sql")).sort();

    const applied: string[] = [];
    for (const file of files) {
      const exists = await client.query<{ filename: string }>(
        `SELECT filename FROM schema_migrations WHERE filename = $1`,
        [file],
      );
      if ((exists.rowCount ?? 0) > 0) {
        applied.push(`${file} (already applied)`);
        continue;
      }
      const sql = await readFile(join(MIGRATIONS_DIR, file), "utf-8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(`INSERT INTO schema_migrations (filename) VALUES ($1)`, [file]);
        await client.query("COMMIT");
        applied.push(file);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`migration ${file} failed: ${(err as Error).message}`);
      }
    }
    return applied;
  } finally {
    client.release();
  }
}

/** Run all migrations as the given client (used by tests with a custom pool). */
export async function runMigrationsOnClient(client: PoolClient): Promise<string[]> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    text PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
  const dir = await readdir(MIGRATIONS_DIR);
  const files = dir.filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const file of files) {
    const exists = await client.query<{ filename: string }>(
      `SELECT filename FROM schema_migrations WHERE filename = $1`,
      [file],
    );
    if ((exists.rowCount ?? 0) > 0) {
      applied.push(`${file} (already applied)`);
      continue;
    }
    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf-8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations (filename) VALUES ($1)`, [file]);
      await client.query("COMMIT");
      applied.push(file);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`migration ${file} failed: ${(err as Error).message}`);
    }
  }
  return applied;
}
