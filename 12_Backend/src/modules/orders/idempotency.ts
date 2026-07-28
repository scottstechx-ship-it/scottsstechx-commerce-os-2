/**
 * Idempotency helper.
 *
 * Persists (user_id, key, request_hash) -> (response_status, response_body).
 * On replay with the same hash, returns the stored response.
 * On replay with a different hash under the same key, throws ConflictError (409).
 *
 * Storage is in the `idempotency_keys` table (see migrations/0001_init.sql).
 * The unique constraint is (user_id, key) so different users can use the same key.
 *
 * Hash is sha256 of the canonical JSON of the request body. We do not use the
 * raw body bytes because Fastify may have already parsed and reordered keys.
 */

import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { ConflictError } from "../../errors.js";

export type IdempotentRecord = {
  response_status: number;
  response_body: unknown;
};

export function hashRequest(body: unknown): string {
  const canonical = canonicalize(body);
  return createHash("sha256").update(canonical).digest("hex");
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
}

/**
 * Look up an existing idempotency record. Returns null if none, throws on hash
 * mismatch. The caller is responsible for inserting the record inside the same
 * transaction as the work it represents, so a crash mid-flight naturally leaves
 * no record and the next retry redoes the work.
 */
export async function checkIdempotency(
  client: PoolClient,
  userId: string,
  key: string,
  requestHash: string,
): Promise<IdempotentRecord | null> {
  const r = await client.query<{
    request_hash: string;
    response_status: number;
    response_body: unknown;
  }>(
    `SELECT request_hash, response_status, response_body
       FROM idempotency_keys
      WHERE user_id = $1 AND key = $2
      FOR UPDATE`,
    [userId, key],
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0]!;
  if (row.request_hash !== requestHash) {
    throw new ConflictError("idempotency key reused with different request body", {
      key,
    });
  }
  return {
    response_status: row.response_status,
    response_body: row.response_body,
  };
}

export async function storeIdempotency(
  client: PoolClient,
  userId: string,
  key: string,
  requestHash: string,
  responseStatus: number,
  responseBody: unknown,
): Promise<void> {
  await client.query(
    `INSERT INTO idempotency_keys (user_id, key, request_hash, response_status, response_body)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, key) DO NOTHING`,
    [userId, key, requestHash, responseStatus, JSON.stringify(responseBody)],
  );
}
