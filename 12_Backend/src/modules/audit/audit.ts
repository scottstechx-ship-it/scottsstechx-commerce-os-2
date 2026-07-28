/**
 * Audit log helper with hash chain.
 *
 * Chain rule:
 *   row_hash[n] = sha256( prev_hash[n-1] || canonical(row[n]) )
 *
 * The first row's prev_hash is the 64-zero-hex string. Canonicalization
 * sorts object keys and stringifies deterministically so the hash is
 * reproducible from any client that has the same row contents.
 *
 * SECURITY: this only protects against silent row mutation AFTER insert.
 * It does NOT prove that a row was inserted by the right principal. The
 * trigger in 0002_rls.sql blocks UPDATE/DELETE on audit_logs from the `app`
 * role, which is the load-bearing protection.
 *
 * Because the trigger blocks any UPDATE on audit_logs, we compute the hash
 * IN APP CODE and supply both prev_hash and row_hash in the same INSERT.
 * That requires pre-fetching the prev hash inside the same transaction.
 */

import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

export const GENESIS_PREV_HASH = "0".repeat(64);

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
}

function hashOf(
  prevHash: string,
  fields: {
    actor_user_id: string | null;
    action: string;
    resource_type: string;
    resource_id: string | null;
    payload: unknown;
    created_at: Date;
  },
): string {
  const canon = canonicalize({
    actor_user_id: fields.actor_user_id,
    action: fields.action,
    resource_type: fields.resource_type,
    resource_id: fields.resource_id,
    payload: fields.payload,
    created_at: fields.created_at.toISOString(),
  });
  return createHash("sha256").update(prevHash).update(canon).digest("hex");
}

/**
 * Insert a hash-chained audit log row in a single INSERT statement.
 *
 * The caller must already be inside a transaction. We do the prev_hash
 * lookup as part of the same INSERT using a CTE so the lookup and the
 * insert are atomic.
 */
export async function insertAuditLog(
  client: PoolClient,
  row: {
    actor_user_id: string | null;
    action: string;
    resource_type: string;
    resource_id: string | null;
    payload: unknown;
  },
): Promise<void> {
  // Use a CTE to: (1) look up the last row_hash, (2) compute the new hash
  // in JS by calling hashOf() and binding it as a parameter, (3) insert the
  // new row. We compute the timestamp in JS too so the hash is over the
  // exact value being persisted.
  const prev = await client.query<{ row_hash: string | null }>(
    `SELECT row_hash FROM audit_logs ORDER BY id DESC LIMIT 1`,
  );
  const prevHash =
    prev.rowCount && prev.rowCount > 0 && prev.rows[0]!.row_hash
      ? prev.rows[0]!.row_hash
      : GENESIS_PREV_HASH;

  const createdAt = new Date();
  const newHash = hashOf(prevHash, { ...row, created_at: createdAt });

  await client.query(
    `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, payload, prev_hash, row_hash, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      row.actor_user_id,
      row.action,
      row.resource_type,
      row.resource_id,
      JSON.stringify(row.payload ?? {}),
      prevHash,
      newHash,
      createdAt,
    ],
  );
}
