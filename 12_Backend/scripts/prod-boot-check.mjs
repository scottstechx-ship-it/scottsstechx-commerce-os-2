/**
 * End-to-end production boot check.
 *
 * Boots a real embedded Postgres, then spawns `node dist/server.js` exactly as
 * the Dockerfile / railway.toml / render.yaml do, and asserts the HTTP service
 * actually comes up and answers.
 *
 * This exists because the unit/integration suite imports buildServer()
 * directly and therefore cannot catch failures in the entrypoint guard,
 * migration-on-boot path, or listen() host/port wiring. A regression there is
 * invisible to `npm test` but takes production down completely.
 *
 * Usage: node scripts/prod-boot-check.mjs
 */

import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const PG_PORT = 46000 + Math.floor(Math.random() * 3000);
const APP_PORT = 39000 + Math.floor(Math.random() * 3000);
const PG_USER = "app";
const PG_PASSWORD = "app";
const PG_DB = "scottstechx_bootcheck";

let pg = null;
let child = null;
let failed = false;

function fail(msg) {
  console.error(`\n[prod-boot-check] FAIL: ${msg}`);
  failed = true;
}

async function waitForHealth(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = "no attempt made";
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      return { ok: false, reason: `process exited early with code ${child.exitCode}` };
    }
    try {
      const res = await fetch(url);
      if (res.ok) return { ok: true, body: await res.json() };
      lastErr = `HTTP ${res.status}`;
    } catch (err) {
      lastErr = err.code ?? String(err);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return { ok: false, reason: `timed out after ${timeoutMs}ms (last: ${lastErr})` };
}

try {
  console.log("[prod-boot-check] starting embedded Postgres...");
  const dataDir = mkdtempSync(join(tmpdir(), "scottstechx-bootcheck-"));
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

  const databaseUrl = `postgres://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${PG_DB}`;
  console.log(`[prod-boot-check] Postgres up on ${PG_PORT}`);

  // Spawn precisely the documented production command.
  console.log(`[prod-boot-check] spawning: node dist/server.js (PORT=${APP_PORT})`);
  child = spawn("node", ["dist/server.js"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: databaseUrl,
      JWT_SECRET: "boot-check-secret-that-is-definitely-long-enough-32",
      PORT: String(APP_PORT),
      HOST: "0.0.0.0",
      LOG_LEVEL: "warn",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (d) => { output += d.toString(); });
  child.stderr.on("data", (d) => { output += d.toString(); });

  const health = await waitForHealth(`http://127.0.0.1:${APP_PORT}/healthz`, 45000);

  if (!health.ok) {
    console.error(`\n--- server output ---\n${output || "(no output)"}\n---------------------`);
    fail(`/healthz never became ready: ${health.reason}`);
  } else {
    console.log(`[prod-boot-check] /healthz -> ${JSON.stringify(health.body)}`);

    // Assert the versioned health endpoint too.
    const v1 = await fetch(`http://127.0.0.1:${APP_PORT}/api/v1/healthz`);
    const v1Body = await v1.json();
    console.log(`[prod-boot-check] /api/v1/healthz -> ${JSON.stringify(v1Body)}`);

    // Assert auth is actually enforced on a protected route.
    const unauth = await fetch(`http://127.0.0.1:${APP_PORT}/api/v1/orders/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "bootcheck-12345678" },
      body: JSON.stringify({}),
    });

    if (v1Body.ok !== true) fail(`/api/v1/healthz did not return ok:true`);
    if (unauth.status !== 401) {
      fail(`unauthenticated checkout returned ${unauth.status}, expected 401`);
    } else {
      console.log(`[prod-boot-check] unauthenticated checkout -> 401 (auth enforced)`);
    }

    if (!failed) {
      console.log("\n[prod-boot-check] PASS: production entrypoint boots and serves traffic.");
    }
  }
} catch (err) {
  fail(`unexpected error: ${err?.stack ?? err}`);
} finally {
  if (child && child.exitCode === null) child.kill("SIGTERM");
  if (pg) { try { await pg.stop(); } catch { /* best effort */ } }
  // Set the exit code last: cleanup above is async, and anything that awaits
  // after an early `process.exitCode = 1` can reset it, silently turning a
  // failed check into a green CI run.
  process.exit(failed ? 1 : 0);
}
