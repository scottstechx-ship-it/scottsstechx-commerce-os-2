/**
 * Memory V2 — per-user memory persistence for the AI.
 *
 * The Android client can use this to record AI memory signals
 * (searches, followed sellers, opened categories) so they survive
 * app close/reboot and the server-side AI can use them in the
 * system prompt.
 *
 *   GET  /api/v1/memory/v2/ai
 *   PUT  /api/v1/memory/v2/ai
 *   POST /api/v1/memory/v2/ai/clear
 *   POST /api/v1/memory/v2/ai/signal
 *     Body: { kind: "search"|"category"|"seller"|"price", value: string|number }
 *     Appends a single signal.
 */
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { requireAuthAny, getAuthUser } from "../../firebase/auth-middleware.js";
import { getPool } from "../../db.js";
import { mirrorToUserDoc } from "../../firebase/mirror.js";

const signalSchema = z.object({
  kind: z.enum(["search", "category", "seller", "price"]),
  value: z.union([z.string(), z.number()]),
});

export async function registerMemoryV2Route(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/v1/memory/v2/ai",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const row = await loadMemory(u.id);
      reply.send(row);
    },
  );

  app.post(
    "/api/v1/memory/v2/ai/clear",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const pool = getPool();
      await pool.query(
        `UPDATE ai_personalization
            SET recent_searches = '{}', top_categories = '{}', followed_sellers = '{}',
                price_low_minor = NULL, price_high_minor = NULL, cleared_at = NOW(),
                updated_at = NOW()
          WHERE user_id = $1`,
        [u.id],
      );
      await mirrorToUserDoc(u.id, "ai_memory", "main", {
        recentSearches: [],
        topCategories: [],
        followedSellers: [],
        clearedAt: new Date().toISOString(),
      });
      reply.send({ ok: true });
    },
  );

  app.post(
    "/api/v1/memory/v2/ai/signal",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const body = signalSchema.parse(request.body);
      const pool = getPool();
      await ensureMemoryRow(pool, u.id);
      const maxLen = 50;
      if (body.kind === "search") {
        const v = String(body.value).slice(0, 100);
        await pool.query(
          `UPDATE ai_personalization
              SET recent_searches = ARRAY(
                    SELECT DISTINCT UNNEST(
                      array_prepend($2::text, recent_searches)
                    )
                  )[1:$3],
                  updated_at = NOW()
            WHERE user_id = $1`,
          [u.id, v, maxLen],
        );
      } else if (body.kind === "category") {
        const v = String(body.value).slice(0, 60);
        await pool.query(
          `UPDATE ai_personalization
              SET top_categories = ARRAY(
                    SELECT DISTINCT UNNEST(
                      array_prepend($2::text, top_categories)
                    )
                  )[1:$3],
                  updated_at = NOW()
            WHERE user_id = $1`,
          [u.id, v, maxLen],
        );
      } else if (body.kind === "seller") {
        const v = String(body.value).slice(0, 80);
        await pool.query(
          `UPDATE ai_personalization
              SET followed_sellers = ARRAY(
                    SELECT DISTINCT UNNEST(
                      array_prepend($2::text, followed_sellers)
                    )
                  )[1:$3],
                  updated_at = NOW()
            WHERE user_id = $1`,
          [u.id, v, maxLen],
        );
      } else if (body.kind === "price") {
        const n = Number(body.value);
        if (Number.isFinite(n) && n >= 0) {
          await pool.query(
            `UPDATE ai_personalization
                SET price_low_minor = LEAST(COALESCE(price_low_minor, $2::bigint), $2::bigint),
                    price_high_minor = GREATEST(COALESCE(price_high_minor, $2::bigint), $2::bigint),
                    updated_at = NOW()
              WHERE user_id = $1`,
            [u.id, n],
          );
        }
      }
      // Mirror to Firestore
      const updated = await loadMemory(u.id);
      await mirrorToUserDoc(u.id, "ai_memory", "main", {
        ...updated,
        updatedAt: new Date().toISOString(),
      });
      reply.send({ ok: true });
    },
  );
}

async function ensureMemoryRow(pool: ReturnType<typeof getPool>, userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO ai_personalization (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
}

async function loadMemory(userId: string): Promise<{
  recentSearches: string[];
  topCategories: string[];
  followedSellers: string[];
  priceLowMinor: number | null;
  priceHighMinor: number | null;
  aiOpenCount: number;
  clearedAt: string | null;
  updatedAt: string;
}> {
  const pool = getPool();
  await ensureMemoryRow(pool, userId);
  const r = await pool.query<{
    recent_searches: string[];
    top_categories: string[];
    followed_sellers: string[];
    price_low_minor: string | null;
    price_high_minor: string | null;
    ai_open_count: number;
    cleared_at: string | null;
    updated_at: string;
  }>(
    `SELECT recent_searches, top_categories, followed_sellers, price_low_minor,
            price_high_minor, ai_open_count, cleared_at, updated_at
       FROM ai_personalization
      WHERE user_id = $1`,
    [userId],
  );
  const row = r.rows[0];
  if (!row) {
    return {
      recentSearches: [],
      topCategories: [],
      followedSellers: [],
      priceLowMinor: null,
      priceHighMinor: null,
      aiOpenCount: 0,
      clearedAt: null,
      updatedAt: new Date().toISOString(),
    };
  }
  return {
    recentSearches: row.recent_searches ?? [],
    topCategories: row.top_categories ?? [],
    followedSellers: row.followed_sellers ?? [],
    priceLowMinor: row.price_low_minor ? Number(row.price_low_minor) : null,
    priceHighMinor: row.price_high_minor ? Number(row.price_high_minor) : null,
    aiOpenCount: row.ai_open_count ?? 0,
    clearedAt: row.cleared_at,
    updatedAt: row.updated_at,
  };
}
