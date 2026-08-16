/**
 * Starts an embedded Postgres and then the compiled server against it,
 * binding to 0.0.0.0 so the sandbox preview proxy can reach it.
 *
 * This is a convenience for local/demo runs only — production supplies a real
 * DATABASE_URL and runs `node dist/server.js` directly.
 */

import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const PG_PORT = 55432;
const APP_PORT = Number(process.env.PORT ?? 3001);

const pg = new EmbeddedPostgres({
  databaseDir: mkdtempSync(join(tmpdir(), "scottstechx-dev-")),
  user: "app",
  password: "app",
  port: PG_PORT,
  persistent: false,
});

await pg.initialise();
await pg.start();
await pg.createDatabase("scottstechx");

const child = spawn("node", ["dist/server.js"], {
  env: {
    ...process.env,
    DATABASE_URL: `postgres://app:app@127.0.0.1:${PG_PORT}/scottstechx`,
    JWT_SECRET: process.env.JWT_SECRET ?? "dev-only-secret-min-32-chars-long-for-local-demo",
    PORT: String(APP_PORT),
    HOST: "0.0.0.0",
    LOG_LEVEL: "info",
  },
  stdio: "inherit",
});

const shutdown = async () => {
  if (child.exitCode === null) child.kill("SIGTERM");
  try { await pg.stop(); } catch { /* best effort */ }
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
child.on("exit", (code) => { pg.stop().catch(() => {}).finally(() => process.exit(code ?? 0)); });
