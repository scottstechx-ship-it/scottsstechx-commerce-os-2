// Load .env from the backend dir. Without this, AI_PROVIDER/LLM_API_KEY/
// JWT_SECRET/GOOGLE_CLIENT_ID are missing when the server is started from
// a plain `npm run dev` (the Desktop helper passes them via spawn env, but
// direct invocations from any terminal won't have them set). We use a
// `dotenv` import here rather than a separate config file so the call
// site is obvious to anyone debugging "why is AI disabled?".
import "dotenv/config";
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
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppError, NotImplementedError } from "./errors.js";
import { runMigrations } from "./migrate.js";
import { getPool } from "./db.js";
import { registerCheckoutRoute } from "./modules/orders/checkout.route.js";
import { registerOrdersRoute } from "./modules/orders/orders.route.js";
// import { registerPodRoute } from "./modules/logistics/pod.route.js";
// import { registerAssignedRoute } from "./modules/logistics/assigned.route.js";
import { registerNearbyRoute } from "./modules/sellers/nearby.route.js";
import { registerSellerDetailRoute } from "./modules/sellers/seller-detail.route.js";
import { registerProfileRoute } from "./modules/seller/profile.route.js";
import { registerInventoryRoute } from "./modules/seller/inventory.route.js";
import { registerDashboardRoute } from "./modules/seller/dashboard.route.js";
import { registerStoreSettingsRoute } from "./modules/seller/store-settings.route.js";
import { registerCustomersRoute } from "./modules/seller/customers.route.js";
import { registerOrdersManagementRoute } from "./modules/seller/orders-mgmt.route.js";
import { registerProductsPowerRoute } from "./modules/seller/products-power.route.js";;
import { registerProductsRoute } from "./modules/products/products.route.js";
import { registerReviewRoute } from "./modules/reviews/review.route.js";
import { registerChatRoute } from "./modules/chat/chat.route.js";
import { registerCartRoute } from "./modules/cart/cart.route.js";
import { registerAssistantRoute } from "./modules/ai/assistant.route.js";
import { registerSellerAiToolsRoute } from "./modules/seller/ai-tools.route.js";
import { registerReportsRoute } from "./modules/seller/reports.route.js";
import { registerGoogleAuthRoute } from "./modules/auth/google.route.js";
import { registerLoginRoutes } from "./modules/auth/login.route.js";
import { registerPaymentRoute } from "./modules/payments/payment.route.js";
import { registerFavoritesRoute } from "./modules/favorites/favorites.route.js";
import { registerSavedSearchesRoute } from "./modules/saved-searches/saved-searches.route.js";
import { registerFindForMeRoute } from "./modules/find-for-me/find-for-me.route.js";
import { registerMeetupRoute } from "./modules/meetup/meetup.route.js";
import { registerAnalyticsRoute } from "./modules/analytics/analytics.route.js";
import { registerSellerTrustRoute } from "./modules/badges/badges.route.js";
import { registerFeedbackRoute } from "./modules/feedback/feedback.route.js";
import { registerAuditRoute } from "./modules/audit/audit.route.js";
import { registerNotificationsRoute } from "./modules/notifications/notifications.route.js";
import { registerAdminUsersRoute } from "./modules/admin/admin.route.js";
import { registerRateLimit } from "./rate-limit.js";
import { registerSecurityHeaders } from "./security-headers.js";
import { registerCors } from "./cors.js";
import { registerFirebaseAuthRoute } from "./modules/auth/firebase-auth.route.js";
import { registerChatV2Route } from "./modules/chat/chat-v2.route.js";
import { registerProductsV2Route } from "./modules/products/products-v2.route.js";
import { registerNearbyV2Route } from "./modules/sellers/nearby-v2.route.js";
import { registerAiV2Route } from "./modules/ai/ai-v2.route.js";
import { registerUserFullRoute } from "./modules/user/user-full.route.js";
import { registerSettingsV2Route } from "./modules/settings/settings-v2.route.js";
import { registerMemoryV2Route } from "./modules/memory/memory-v2.route.js";

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
  await registerLoginRoutes(app);
  await registerAssistantRoute(app); // includes /api/v1/ai/status
  await registerSellerAiToolsRoute(app, () => process.env.LLM_API_KEY?.length ? true : false);
  await registerReportsRoute(app);

  // Authenticated
    await registerCheckoutRoute(app);
    await registerOrdersRoute(app);
    // await registerPodRoute(app);
    // await registerAssignedRoute(app);
    await registerProductsRoute(app);
  await registerNearbyRoute(app);
  await registerSellerDetailRoute(app);
  await registerProfileRoute(app);
  await registerInventoryRoute(app);
  await registerDashboardRoute(app)
  await registerStoreSettingsRoute(app)
  await registerCustomersRoute(app)
  await registerOrdersManagementRoute(app)
  await registerProductsPowerRoute(app);
  await registerReviewRoute(app);
  await registerChatRoute(app)
  registerFirebaseAuthRoute(app)
  registerChatV2Route(app)
  registerProductsV2Route(app)
  registerNearbyV2Route(app)
  registerAiV2Route(app)
  registerSettingsV2Route(app)
  registerUserFullRoute(app)
  registerMemoryV2Route(app);
  await registerCartRoute(app);
  // Capture the raw request body for the Stripe webhook so signature
  // verification can operate on the original bytes (not the parsed JSON).
  // This parser runs only when the route declares `config.rawBody`, which
  // is currently only the webhook route.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (req, body, done) => {
      (req as unknown as { rawBody?: string }).rawBody = body as string;
      try {
        const json = body === "" || body == null ? {} : JSON.parse(body as string);
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );
  await registerPaymentRoute(app);
  await registerFavoritesRoute(app);
    await registerSavedSearchesRoute(app);
    await registerFindForMeRoute(app);
    await registerMeetupRoute(app);
    await registerAnalyticsRoute(app);
    await registerSellerTrustRoute(app);
    await registerFeedbackRoute(app);
      await registerAuditRoute(app);
      await registerNotificationsRoute(app);
      await registerAdminUsersRoute(app);

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

  // ---- BACKGROUND GPS SIMULATOR ----
  setInterval(async () => {
    try {
      await getPool().query(`
        UPDATE orders
        SET driver_lat = driver_lat + (0.0001 * (random() - 0.5)),
            driver_lng = driver_lng + (0.0001 * (random() - 0.5))
        WHERE status IN ('assigned', 'picked_up')
      `);
    } catch (_e) { /* silent */ }
  }, 10000);

  return app;
}

/**
 * Spin up an embedded Postgres so the dev machine has somewhere to connect
 * without needing Docker or a system install. The first run downloads the
 * Postgres binary (~50 MB) into a temp directory; subsequent runs reuse it.
 *
 * Port is fixed at 5433 by default (matches the connection string in
 * server.ts). Pass SCOTTS_PG_PORT to override if 5433 is taken.
 *
 * Hot-reload safety: when tsx watch restarts this file, the old Postgres
 * child process is still bound to port 5433 and holding the dataDir. We
 * cache the dataDir on globalThis AND stop any cached handle before
 * starting a new one. Without this, every reload left the server with
 * a fresh empty DB and no migrations applied (the old process was
 * holding 5433, so the new server's `pg.start()` would have failed too).
 */
async function startEmbeddedPostgres(): Promise<{
  handle: EmbeddedPostgres;
  connectionString: string;
}> {
  const port = Number(process.env.SCOTTS_PG_PORT ?? 5433);
  const user = process.env.SCOTTS_PG_USER ?? "app";
  const password = process.env.SCOTTS_PG_PASSWORD ?? "app";
  const db = process.env.SCOTTS_PG_DB ?? "scottstechx";

  // Stop a previously-started PG process so the port is free and the
  // dataDir lock is released before we start a new one.
  const cached = (globalThis as { __scottsTechXPG?: EmbeddedPostgres; __scottsTechXPGDir?: string }).__scottsTechXPG;
  const cachedDir = (globalThis as { __scottsTechXPGDir?: string }).__scottsTechXPGDir;
  if (cached) {
      try {
        await cached.stop();
      } catch (_e) {
        // best-effort: an already-dead pg is fine
      }
    }

  // Reuse the dataDir across restarts so the schema and seed data
  // survive `tsx watch` reloads. The temp dir is still ephemeral across
  // OS reboots, which matches the pre-existing "no data on reboot" caveat
  // documented in the README.
  const dataDir =
    cachedDir && existsSync(cachedDir) ? cachedDir : mkdtempSync(join(tmpdir(), "scottsTechX-pg-"));
  (globalThis as { __scottsTechXPGDir?: string }).__scottsTechXPGDir = dataDir;

  console.log(`[embedded-pg] dataDir=${dataDir} port=${port} db=${db}`);
  // embedded-postgres 0.4.x on Windows + Node 22 has a known race where
  // the checkpointer and background writer subprocesses (which
  // postgres starts internally) can exit before they're fully detached,
  // triggering a "terminating any other active server processes"
  // shutdown ~30-60s after init. We disable both via `postgresFlags`
  // — for an embedded dev/test database on a single writer connection,
  // neither is needed, and the foreground postgres process becomes
  // its own writer and checkpointer.
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user,
    password,
    port,
    persistent: false,
    // PostgreSQL on Windows accepts -F (fsync off) which greatly
    // improves stability for embedded dev/test use. We also pass
    // `idle_session_timeout = 0` to keep alive sessions for the
    // lifetime of the dev server.
    postgresFlags: ['-F'],
    authMethod: 'password',
  });
  try {
    await pg.initialise();
  } catch (e) {
    // initialise() throws if the dataDir is already initialised (it is,
    // on every tsx reload). Swallow that case and proceed to start().
    const msg = (e as Error).message ?? "";
    if (!/already.*initialised|already.*exists|not.*empty/i.test(msg)) {
      throw e;
    }
  }
  // Patch postgresql.conf BEFORE start() so embedded-postgres picks
  // up our settings. The conf file is created by initdb() during
  // initialise() above.
  //
  // KEY WORKAROUND: embedded-postgres 0.4.x on Windows has a known
  // bug where the background writer subprocess crashes ~30-60s after
  // start, which causes postgres itself to call
  // "terminating any other active server processes" and shut down
  // the whole DB. We disable the bgwriter and auto-checkpointer via
  // these settings so postgres has zero child subprocesses to
  // crash. For an embedded dev/test DB on a single-writer connection
  // this is perfectly safe — the foreground backend connection IS
  // the writer.
  const confPath = join(dataDir, "postgresql.conf");
  if (existsSync(confPath)) {
    const orig = readFileSync(confPath, "utf8");
    const patched = orig
      .split("\n")
      .filter(line => !/^\s*(shared_buffers|max_connections|fsync|synchronous_commit|full_page_writes|checkpoint_timeout|autovacuum)\s*=/i.test(line))
      .join("\n") +
      `\n# ScottsTechX embedded-postgres workarounds\n` +
      `shared_buffers = 64MB\n` +
      `max_connections = 20\n` +
      `fsync = off\n` +
      `synchronous_commit = off\n` +
      `full_page_writes = off\n` +
      `checkpoint_timeout = 1d\n` +
      // Disable the background writer too. bgwriter crashes on Windows
      // under embedded-postgres, killing the whole DB. Setting
      // bgwriter_lru_maxpages to 0 makes it a no-op, and combined with
      // checkpoint_timeout=1d the only remaining child is the walwriter
      // which is part of the main postgres process.
      `bgwriter_lru_maxpages = 0\n` +
      `bgwriter_delay = 10000\n` +
      `autovacuum = off\n`;
    writeFileSync(confPath, patched);
    console.log(`[embedded-pg] patched postgresql.conf`);
  }
  await pg.start();
  await pg.createDatabase(db).catch(() => {
    // createDatabase throws if the DB exists (subsequent runs). That's
    // expected and fine.
  });
  // Use the real password here, not a redacted literal — this is the
  // value the `pg` pool will authenticate with.
  const connectionString = `postgres://${user}:${password}@127.0.0.1:${port}/${db}`;
  console.log(`[embedded-pg] ready on port ${port} as ${user}@${db}`);
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
