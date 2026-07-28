/**
 * Test bootstrap: boots embedded Postgres, applies migrations, and exposes
 * a Fastify app instance per test file.
 *
 * Why embedded-postgres: this dev machine has no Docker and no system Postgres.
 * The embedded-postgres npm package downloads a real Postgres binary on first
 * run and starts it on a configurable port. The SQL/RLS code is byte-for-byte
 * portable to a real Supabase project later.
 *
 * Port randomization: every test run picks a fresh port in 40000-45000 so a
 * crashed Postgres from a previous run cannot block the next.
 */

import EmbeddedPostgres from "embedded-postgres";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runMigrationsOnClient } from "../src/migrate.js";
import { buildServer } from "../src/server.js";
import { signToken } from "../src/auth.js";

let pg: EmbeddedPostgres | null = null;
let testConnectionString = "";
let serverInstance: Awaited<ReturnType<typeof buildServer>> | null = null;
let port = 0;

const PG_USER = "app";
const PG_PASSWORD = "app";
const PG_DB = "scottstechx_test";
const PG_PORT = 40000 + Math.floor(Math.random() * 5000);

export async function setup(): Promise<void> {
  // Set env BEFORE importing modules that read it.
  process.env.JWT_SECRET = "test-secret-must-be-at-least-32-chars-long-please";
  process.env.JWT_ISSUER = "scottstechx";
  process.env.JWT_AUDIENCE = "scottstechx-api";
  process.env.LOG_LEVEL = "error";

  const dataDir = mkdtempSync(join(tmpdir(), "scottstechx-pg-data-"));

  pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: PG_USER,
    password: PG_PASSWORD,
    port: PG_PORT,
    persistent: false,
  });

  await pg.initialise();
  await pg.start();
  await pg.createDatabase(PG_DB);

  testConnectionString = `postgres://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${PG_DB}`;
  process.env.DATABASE_URL = testConnectionString;

  // The migrate.ts uses the global pool which is keyed on DATABASE_URL.
  // Apply migrations by getting a client from that pool.
  const { getPool, closePool } = await import("../src/db.js");
  const pool = getPool(testConnectionString);
  const client = await pool.connect();
  try {
    await runMigrationsOnClient(client);
    // Create the `rls_tester` non-superuser role used by RLS tests in
    // api.test.ts / security.test.ts / db.test.ts. It must NOT have
    // BYPASSRLS so RLS is actually enforced for the test connection.
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rls_tester') THEN
          CREATE ROLE rls_tester NOLOGIN;
        END IF;
      END $$
    `);
    await client.query(`GRANT USAGE ON SCHEMA public TO rls_tester`);
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rls_tester`);
    await client.query(`ALTER ROLE rls_tester NOBYPASSRLS`);
  } finally {
    client.release();
  }
  await closePool();

  // Build the Fastify app on a random port; we'll point fetch at it.
  serverInstance = await buildServer();
  await serverInstance.listen({ port: 0, host: "127.0.0.1" });
  const addr = serverInstance.server.address();
  if (typeof addr === "object" && addr) {
    port = addr.port;
  }

  // Print the port so we can debug collisions in CI logs.
  console.log(`[test/setup] Postgres on ${PG_PORT}, Fastify on ${port}`);
}

export async function teardown(): Promise<void> {
  if (serverInstance) {
    await serverInstance.close();
    serverInstance = null;
  }
  const { closePool } = await import("../src/db.js");
  try {
    await closePool();
  } catch {
    /* already closed */
  }
  if (pg) {
    try {
      await pg.stop();
    } catch {
      /* best effort */
    }
    pg = null;
  }
}

export function getBaseUrl(): string {
  return `http://127.0.0.1:${port}`;
}

export function getConnectionString(): string {
  return testConnectionString;
}

export const SEED = {
  buyerId: "11111111-1111-4111-8111-111111111111",
  sellerId: "22222222-2222-4222-8222-222222222222",
  driverId: "33333333-3333-4333-8333-333333333333",
  productA: "a1b2c3d4-0001-4000-8000-000000000001",
  productB: "a1b2c3d4-0002-4000-8000-000000000002",
  productC: "a1b2c3d4-0003-4000-8000-000000000003",
};

export async function mintToken(
  role: "buyer" | "driver" | "seller" | "admin",
  userId: string,
): Promise<string> {
  return signToken({ id: userId, role, email: `${role}@test` });
}

export function randomIdempotencyKey(): string {
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
