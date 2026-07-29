/**
 * Fastify server.
 *
 * Boots: migrate -> register routes -> start.
 *
 * Routes registered:
 *   Public:
 *     GET  /healthz
 *     GET  /api/v1/healthz
 *     POST /api/v1/auth/google
 *     GET  /api/v1/ai/status
 *   Authenticated (JWT):
 *     POST /api/v1/orders/checkout
 *     POST /api/v1/logistics/pod
 *     GET  /api/v1/sellers/nearby
 *     GET  /api/v1/sellers/:sellerId
 *     GET  /api/v1/seller/profile
 *     PATCH /api/v1/seller/profile
 *     GET  /api/v1/seller/inventory
 *     POST /api/v1/seller/inventory
 *     PATCH /api/v1/seller/inventory/:productId
 *     DELETE /api/v1/seller/inventory/:productId
 *     GET  /api/v1/seller/stats
 *     GET  /api/v1/seller/orders
 *     POST /api/v1/reviews
 *     GET  /api/v1/chat/messages
 *     POST /api/v1/chat/messages
 *     POST /api/v1/ai/seller-suggest  (rate-limited)
 *     POST /api/v1/ai/customer-chat   (rate-limited)
 *     POST /api/v1/ai/reason          (rate-limited)
 */

import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import EmbeddedPostgres from "embedded-postgres";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppError, NotImplementedError } from "./errors.js";
import { runMigrations } from "./migrate.js";
import { registerCheckoutRoute } from "./modules/orders/checkout.route.js";
import { registerPodRoute } from "./modules/logistics/pod.route.js";
import { registerNearbyRoute } from "./modules/sellers/nearby.route.js";
import { registerSellerDetailRoute } from "./modules/sellers/seller-detail.route.js";
import { registerProfileRoute } from "./modules/seller/profile.route.js";
import { registerInventoryRoute } from "./modules/seller/inventory.route.js";
import { registerDashboardRoute } from "./modules/seller/dashboard.route.js";
import { registerReviewRoute } from "./modules/reviews/review.route.js";
import { registerChatRoute } from "./modules/chat/chat.route.js";
import { registerAssistantRoute } from "./modules/ai/assistant.route.js";
import { registerGoogleAuthRoute } from "./modules/auth/google.route.js";
import { registerRateLimit } from "./rate-limit.js";
import { registerSecurityHeaders } from "./security-headers.js";
import { registerCors } from "./cors.js";

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      transport: undefined,
    },
    // Allow up to 2MB JSON bodies; POD submissions can be sizeable.
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: true,
  });

  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof AppError) {
      const headers: Record<string, string> = {};
      if (err instanceof NotImplementedError) {
        headers["x-stub-reason"] = err.stubReason;
      }
      reply
        .status(err.httpStatus)
        .headers(headers)
        .send({ error: err.code, message: err.message, details: err.details });
      return;
    }
    if (err && typeof err === "object" && "issues" in (err as Record<string, unknown>)) {
      reply.status(400).send({
        error: "validation",
        message: "request body failed validation",
        issues: (err as { issues: unknown }).issues,
      });
      return;
    }
    if ("validation" in (err as FastifyError)) {
      const fe = err as FastifyError;
      reply.status(400).send({
        error: "validation",
        message: fe.message,
      });
      return;
    }
    const code = (err as { code?: string }).code;
    if (code === "FST_ERR_CTP_INVALID_JSON_BODY" || code === "FST_ERR_CTP_EMPTY_JSON_BODY") {
      reply.status(400).send({
        error: "validation",
        message: "request body is not valid JSON",
      });
      return;
    }
    app.log.error({ err }, "unhandled");
    reply.status(500).send({ error: "internal", message: "internal server error" });
  });

  registerSecurityHeaders(app);
  registerCors(app);
  await registerRateLimit(app);

  app.get("/healthz", async () => ({ ok: true }));
  app.get("/api/v1/healthz", async () => ({ ok: true, version: "1.0.0" }));

  // Public
  await registerGoogleAuthRoute(app);
  await registerAssistantRoute(app); // includes /api/v1/ai/status

  // Authenticated
  await registerCheckoutRoute(app);
  await registerPodRoute(app);
  await registerNearbyRoute(app);
  await registerSellerDetailRoute(app);
  await registerProfileRoute(app);
  await registerInventoryRoute(app);
  await registerDashboardRoute(app);
  await registerReviewRoute(app);
  await registerChatRoute(app);

  return app;
}

export async function startServer(): Promise<FastifyInstance> {
  console.log("[start] server boot, NODE_ENV=", process.env.NODE_ENV);
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = "dev-secret-do-not-use-in-prod-min-32-chars-long-please";
  }
  if (!process.env.DATABASE_URL) {
    // In dev/test we spin up an embedded Postgres on a random port
    // (see startEmbeddedPostgres below). In production we expect the
    // operator to provide a real DATABASE_URL (Render / Supabase / Neon / etc).
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "DATABASE_URL is not set. In production, configure DATABASE_URL to point at a managed Postgres.",
      );
    }
    const pg = await startEmbeddedPostgres();
    process.env.DATABASE_URL = pg.connectionString;
    // Stash the handle on globalThis so teardown / hot-reload can stop it.
    (globalThis as { __scottsTechXPG?: EmbeddedPostgres }).__scottsTechXPG = pg.handle;
  }
  // Build the Fastify server FIRST and start listening so the healthcheck
  // can return 200 well before the migrations finish. This is critical for
  // Railway's 10-second healthcheck window — the first DB connection to a
  // cold Neon server can take 5-15s, and we don't want the healthcheck to
  // kill the container before the app is ready to serve.
  const app = await buildServer();
  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? "0.0.0.0";
  await app.listen({ port, host });
  console.log("[start] fastify listening on", host + ":" + port);

  // Run migrations in the background — failure is logged but does not kill
  // the listener. The /healthz endpoint returns 200 as soon as the server
  // binds; that is the correct behavior for a Railway healthcheck.
  runMigrations()
    .then((applied) => console.log("[migrate] applied:", applied))
    .catch((err) => console.error("[migrate] FAILED:", err));

  return app;
}

/**
 * Spin up an embedded Postgres so the dev machine has somewhere to connect
 * without needing Docker or a system install. The first run downloads the
 * Postgres binary (~50 MB) into a temp directory; subsequent runs reuse it.
 *
 * Port is fixed at 5433 by default (matches the connection string in
 * server.ts). Pass SCOTTS_PG_PORT to override if 5433 is taken.
 */
async function startEmbeddedPostgres(): Promise<{
  handle: EmbeddedPostgres;
  connectionString: string;
}> {
  const port = Number(process.env.SCOTTS_PG_PORT ?? 5433);
  const user = process.env.SCOTTS_PG_USER ?? "app";
  const password = process.env.SCOTTS_PG_PASSWORD ?? "app";
  const db = process.env.SCOTTS_PG_DB ?? "scottstechx";
  const dataDir = mkdtempSync(join(tmpdir(), "scottsTechX-pg-"));
  console.log(`[embedded-pg] dataDir=${dataDir} port=${port} db=${db}`);
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user,
    password,
    port,
    persistent: false,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase(db);
  const connectionString = `postgres://${user}:${password}@127.0.0.1:${port}/${db}`;
  console.log(`[embedded-pg] ready: ${connectionString}`);
  return { handle: pg, connectionString };
}

// Compare URL-encoded paths. process.argv[1] is filesystem-style
// (backslashes, literal spaces); import.meta.url is URL-encoded
// (forward slashes, %20 for spaces). encodeURI normalizes both.
const isMain = typeof process.argv[1] === "string"
  && import.meta.url === `file:///${encodeURI(process.argv[1].replace(/\\/g, "/"))}`;
if (isMain) {
  startServer().catch((err) => {
    console.error("server failed to start:", err);
    process.exit(1);
  });
}
