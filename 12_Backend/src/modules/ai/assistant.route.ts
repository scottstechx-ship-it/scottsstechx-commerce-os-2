import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { requireAuth, getAuthUser } from "../../auth.js";
import {
  AiDisabledError,
  callAi,
  getProvider,
  persistSuggestion,
  resolveChain,
  type SuggestionType,
} from "./assistant.service.js";
import { withTransaction } from "../../db.js";

const sellerSuggestSchema = z.object({
  type: z.enum([
    "product_description",
    "auto_price",
    "category",
    "inventory_warning",
  ]),
  draft: z.record(z.string(), z.unknown()),
  context: z.record(z.string(), z.unknown()).optional(),
});

const customerChatSchema = z.object({
  sessionId: z.string().min(1).max(100),
  message: z.string().min(1).max(2000),
  // Optional buyer location for the "what's near me?" framing. The
  // customer-chat endpoint previously never saw location, which
  // meant the LLM answered generic questions with no geographic
  // grounding. The service layer reads these and uses them to pull
  // the nearest sellers for the prompt.
  locationLat: z.number().min(-90).max(90).optional(),
  locationLng: z.number().min(-180).max(180).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      }),
    )
    .max(40)
    .optional(),
});

const reasonSchema = z.object({
  sellerId: z.string().uuid(),
  context: z.record(z.string(), z.unknown()).optional(),
});

// Body for the unified AI Assistant. The assistant's role is decided by
// the JWT (getAuthUser().role), not by the request body — clients can't
// elevate themselves. message is the user's free-form question; history
// is the last few exchanges for conversational context.
const assistantSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .max(40)
    .optional(),
  // Optional explicit lat/lng. Buyers typically send these (current GPS);
  // sellers usually omit (their business location is on their profile).
  locationLat: z.number().min(-90).max(90).optional(),
  locationLng: z.number().min(-180).max(180).optional(),
});

export async function registerAssistantRoute(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/ai/status", async (_req, reply) => {
    const provider = getProvider();
    const chain = resolveChain(provider);
    reply.send({
      enabled: !!provider || chain.length > 0,
      provider: provider ?? null,
      chain,
      chainMode: (process.env.AI_CHAIN ?? "primary").toLowerCase(),
      hasFallbackKey: !!process.env.LLM_API_KEY_FALLBACK,
    });
  });

  app.post(
    "/api/v1/ai/seller-suggest",
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = getAuthUser(request);
      if (user.role !== "seller") {
        reply.status(403).send({ error: "forbidden", message: "sellers only" });
        return;
      }
      const body = sellerSuggestSchema.parse(request.body);
      try {
        const out = await callAi({
          type: body.type as SuggestionType,
          draft: body.draft,
          context: body.context,
        });
        await persistSuggestion({
          userId: user.id,
          role: user.role,
          sellerId: user.id,
          suggestionType: body.type as SuggestionType,
          payload: { input: body, output: out },
          provider: out.provider,
        });
        reply.send(out);
      } catch (err) {
        if (err instanceof AiDisabledError) {
          reply
            .status(503)
            .send({ error: "ai_disabled", message: err.message });
          return;
        }
        request.log.error({ err }, "ai_upstream_error");
        const msg = err instanceof Error ? err.message : "AI upstream error";
        reply.status(502).send({
          error: "ai_upstream_error",
          message: msg.slice(0, 240),
        });
      }
    },
  );

  app.post(
    "/api/v1/ai/customer-chat",
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = getAuthUser(request);
      const body = customerChatSchema.parse(request.body);
      try {
        const out = await callAi({
          type: "customer_chat",
          draft: { message: body.message },
          history: body.history,
        });
        await withTransaction(
          { userId: user.id, role: user.role },
          async (c) => {
            await c.query(
              `INSERT INTO chat_messages (sender_user_id, role, content, session_id)
               VALUES ($1, 'buyer', $2, $3)`,
              [user.id, body.message, body.sessionId],
            );
            await c.query(
              `INSERT INTO chat_messages (sender_user_id, role, content, session_id)
               VALUES ($1, 'ai', $2, $3)`,
              [user.id, out.suggestion, body.sessionId],
            );
          },
        );
        await persistSuggestion({
          userId: user.id,
          role: user.role,
          suggestionType: "customer_chat",
          payload: { message: body.message, reply: out.suggestion },
          provider: out.provider,
        });
        reply.send({ reply: out.suggestion, provider: out.provider });
      } catch (err) {
        if (err instanceof AiDisabledError) {
          reply
            .status(503)
            .send({ error: "ai_disabled", message: err.message });
          return;
        }
        // Upstream LLM errors (quota, transient, etc.) get translated to 502
        // so the client can distinguish "AI is off" (503) from "AI is up but
        // rejected this request" (502). The body keeps the upstream message
        // so debugging is easy without exposing the API key.
        request.log.error({ err }, "ai_upstream_error");
        const msg = err instanceof Error ? err.message : "AI upstream error";
        reply.status(502).send({
          error: "ai_upstream_error",
          message: msg.slice(0, 240),
        });
      }
    },
  );

  app.post(
    "/api/v1/ai/reason",
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = getAuthUser(request);
      const body = reasonSchema.parse(request.body);
      try {
        const out = await callAi({
          type: "trust_reasoning",
          draft: { sellerId: body.sellerId },
          context: body.context,
        });
        await persistSuggestion({
          userId: user.id,
          role: user.role,
          suggestionType: "trust_reasoning",
          payload: { sellerId: body.sellerId, context: body.context, output: out },
          provider: out.provider,
        });
        reply.send({
          trustReasoning: out.suggestion,
          rankReasoning: out.suggestion,
          recommendation: out.suggestion,
          provider: out.provider,
          confidence: out.confidence,
        });
      } catch (err) {
        if (err instanceof AiDisabledError) {
          reply
            .status(503)
            .send({ error: "ai_disabled", message: err.message });
          return;
        }
        request.log.error({ err }, "ai_upstream_error");
        const msg = err instanceof Error ? err.message : "AI upstream error";
        reply.status(502).send({
          error: "ai_upstream_error",
          message: msg.slice(0, 240),
        });
      }
    },
  );

  // ---- Unified AI Assistant ---------------------------------------------
  // POST /api/v1/ai/assistant
  //
  // The route is role-aware: a buyer gets a "local personal shopper"
  // prompt seeded with their GPS and the categories of nearby sellers;
  // a seller gets a "business manager" prompt seeded with their active
  // listings. The assistant cannot be mis-elevated by the client —
  // role comes from the JWT, not the request body.
  //
  // Context assembly (what the LLM actually sees):
  //   BUYER:  { location: {lat,lng, accuracy?}, nearby_categories: [...],
  //             nearby_sellers: [{name, distance_km, product_count}],
  //             question }
  //   SELLER: { business: {name, lat, lng, trust_score}, active_listings:
  //             [{title, price_minor, stock, category}], question }
  //
  // We deliberately DO NOT include user PII (no email, no display_name in
  // the prompt — only role-derived context). The prompt is short so the
  // LLM can't drift into making things up.
  app.post(
    "/api/v1/ai/assistant",
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = getAuthUser(request);
      // Admin role is not supported by this endpoint yet.
      // Sellers and buyers are the two primary surfaces.
      if (user.role !== "buyer" && user.role !== "seller") {
        reply.status(403).send({
          error: "forbidden",
          message: "AI Assistant is only available for buyers and sellers",
        });
        return;
      }

      const body = assistantSchema.parse(request.body);

      try {
        const out = await withTransaction(
          { userId: user.id, role: user.role },
          async (c) => {
            const ctx: Record<string, unknown> = {};

            if (user.role === "buyer") {
              const lat = body.locationLat ?? null;
              const lng = body.locationLng ?? null;
              ctx.location = lat !== null && lng !== null
                ? { lat, lng }
                : null;

              // Find nearby sellers (within 25 km) and the categories
              // of products they sell. The query mirrors /sellers/nearby
              // (haversine on lat/lng numeric columns) and only pulls the
              // active product titles. We cap at 20 sellers to keep the
              // prompt small.
              //
              // Pre-fix this used PostGIS `point(lng,lat) <-> point($1,$2)`
              // which requires the `cube` + `earthdistance` extensions and
              // referenced columns named `seller.lat` / `seller.lng` that
              // don't exist. The query failed for every buyer. Now it uses
              // plain numeric haversine on `sp.lat` / `sp.lng` — matches
              // modules/sellers/nearby.service.ts.
              if (lat !== null && lng !== null) {
                const nearby = await c.query<{
                  business_name: string;
                  distance_km: number;
                  category: string | null;
                }>(
                  `SELECT sp.business_name,
                          (6371000 * acos(LEAST(1.0, GREATEST(-1.0,
                             cos(radians($1::float8)) * cos(radians(sp.lat::float8))
                             * cos(radians(sp.lng::float8) - radians($2::float8))
                             + sin(radians($1::float8)) * sin(radians(sp.lat::float8))
                          )))) / 1000.0 AS distance_km,
                          p.title AS category
                     FROM seller_profiles sp
                LEFT JOIN products p
                            ON p.seller_id = sp.user_id AND p.is_active = true
                    WHERE sp.lat IS NOT NULL AND sp.lng IS NOT NULL
                      AND (6371000 * acos(LEAST(1.0, GREATEST(-1.0,
                             cos(radians($1::float8)) * cos(radians(sp.lat::float8))
                             * cos(radians(sp.lng::float8) - radians($2::float8))
                             + sin(radians($1::float8)) * sin(radians(sp.lat::float8))
                          )))) < 25000
                 ORDER BY distance_km ASC
                    LIMIT 20`,
                  [lat, lng],
                );
                ctx.nearby_sellers = nearby.rows.map((r) => ({
                  name: r.business_name,
                  distance_km: Math.round(r.distance_km * 10) / 10,
                  product: r.category,
                }));
                // Distinct category list for the "what's near me" framing
                const cats = new Set(
                  nearby.rows.map((r) => r.category).filter((c): c is string => !!c),
                );
                ctx.nearby_categories = Array.from(cats);
              }
            }

            if (user.role === "seller") {
              // Pull the seller's own profile + active listings.
              const profile = await c.query<{
                business_name: string;
                lat: number | null;
                lng: number | null;
                seller_trust_score: number | null;
              }>(
                `SELECT sp.business_name, sp.lat, sp.lng, sp.seller_trust_score
                   FROM seller_profiles sp
                  WHERE sp.user_id = $1`,
                [user.id],
              );
              const listings = await c.query<{
                title: string;
                price_minor: string;
                currency: string;
                stock_quantity: number;
              }>(
                `SELECT title, price_minor::text, currency, stock_quantity
                   FROM products
                  WHERE seller_id = $1 AND is_active = true
                  ORDER BY created_at DESC
                  LIMIT 50`,
                [user.id],
              );
              ctx.business = profile.rows[0] ?? null;
              ctx.active_listings = listings.rows;
            }

            return await callAi({
              type: user.role === "buyer" ? "buyer_assistant" : "seller_assistant",
              draft: { message: body.message },
              context: ctx,
              history: body.history,
            });
          },
        );

        await persistSuggestion({
          userId: user.id,
          role: user.role,
          suggestionType: user.role === "buyer" ? "buyer_assistant" : "seller_assistant",
          payload: {
            message: body.message,
            context_keys: Object.keys({} as Record<string, unknown>),
            output: out,
          },
          provider: out.provider,
        });

        reply.send({
          reply: out.suggestion,
          provider: out.provider,
          confidence: out.confidence,
          role: user.role,
        });
      } catch (err) {
        if (err instanceof AiDisabledError) {
          reply.status(503).send({
            error: "ai_disabled",
            message: err.message,
          });
          return;
        }
        request.log.error({ err }, "ai_assistant_upstream_error");
        const msg = err instanceof Error ? err.message : "AI upstream error";
        reply.status(502).send({
          error: "ai_upstream_error",
          message: msg.slice(0, 240),
        });
      }
    },
  );
}
