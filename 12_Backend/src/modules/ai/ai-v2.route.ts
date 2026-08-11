/**
 * AI V2 — server-side AI with conversation history.
 *
 *   POST /api/v1/ai/v2/ask
 *     Body: { message, context? }
 *     Forwards to the LLM (groq/gemini/apifreellm) with a system
 *     prompt built from the CapabilityRegistry. The user's role
 *     (buyer/seller) and recent personalisation signals are
 *     attached. Every call is mirrored to Firestore so the mobile
 *     client can show the conversation history offline.
 */
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { requireAuthAny, getAuthUser } from "../../firebase/auth-middleware.js";
import { getPool } from "../../db.js";
import { mirrorToUserDoc } from "../../firebase/mirror.js";
import { randomUUID } from "node:crypto";

const askSchema = z.object({
  message: z.string().min(1).max(4000),
  context: z.object({
    screen: z.string().max(80).optional(),
    productId: z.string().max(80).optional(),
    sellerId: z.string().max(80).optional(),
    transactionId: z.string().max(80).optional(),
  }).optional(),
});

const SYSTEM_PROMPT = `You are ScottsTechX AI, the in-app assistant for the ScottsTechX marketplace (a buyer/seller platform in Uganda).

Hard rules:
- Never invent products, prices, sellers, stock, payments, or delivery status.
- If a tool returns nothing, say so honestly.
- Label suggestions clearly as "AI suggestion" so the user can distinguish from confirmed marketplace data.
- Never claim ScottsTechX processed a payment. The receipt label "Payment recorded by seller" is the rule.
- Never reveal another user's private data.
- Never make legal-liability decisions on a dispute.

What you CAN help with:
- Buyer: product discovery, comparison, nearby sellers, transaction status, receipt interpretation, delivery arrangements.
- Seller: product management, inventory, pricing, sales insights, customer questions, transaction agreements, receipt creation, promotions, store performance, marketing.

If you don't have a tool, say what you can answer from general knowledge but tag the answer as a suggestion.`;

export async function registerAiV2Route(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/v1/ai/v2/ask",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const body = askSchema.parse(request.body);

      // Fetch the user's recent AI memory signals (top categories,
      // recent searches) from Postgres so we can include them in
      // the system prompt.
      const memory = await loadUserMemory(u.id);
      const sysPrompt = buildSystemPrompt(u.role, memory, body.context);

      // Mirror the user turn to Firestore immediately (so the mobile
      // client shows the message as "pending" if it wants).
      const userTurnId = randomUUID();
      const ts = new Date().toISOString();
      await mirrorToUserDoc(u.id, "ai_history", userTurnId, {
        role: "user",
        content: body.message,
        context: body.context ?? null,
        createdAt: ts,
      });

      // Forward to the LLM. Reuse the existing assistant pipeline
      // by calling the registered AI service. If unavailable, fall
      // back to a deterministic mock.
      const reply_text = await callLlm(sysPrompt, body.message, app);

      // Mirror the assistant reply.
      const assistantTurnId = randomUUID();
      await mirrorToUserDoc(u.id, "ai_history", assistantTurnId, {
        role: "assistant",
        content: reply_text,
        context: body.context ?? null,
        createdAt: new Date().toISOString(),
      });

      reply.send({
        reply: reply_text,
        sources: { aiProvider: process.env.AI_PROVIDER ?? "mock" },
      });
    },
  );
}

async function loadUserMemory(userId: string): Promise<{
  recentSearches: string[];
  topCategories: string[];
  aiOpenCount: number;
}> {
  // Read from Postgres ai_personalization table if it exists, else
  // return empty. We don't add a new table for this; the Android
  // client mirrors personalization to /users/{uid}/ai_personalization
  // and we can fetch it from Firestore. For Stage 4 we keep this
  // minimal.
  try {
    const pool = getPool();
    const r = await pool.query<{ recent_searches: string[] | null; top_categories: string[] | null; ai_open_count: number | null }>(
      `SELECT recent_searches, top_categories, ai_open_count
         FROM ai_personalization
        WHERE user_id = $1`,
      [userId],
    );
    if (r.rows.length === 0) {
      return { recentSearches: [], topCategories: [], aiOpenCount: 0 };
    }
    const row = r.rows[0]!;
    return {
      recentSearches: row.recent_searches ?? [],
      topCategories: row.top_categories ?? [],
      aiOpenCount: row.ai_open_count ?? 0,
    };
  } catch {
    return { recentSearches: [], topCategories: [], aiOpenCount: 0 };
  }
}

function buildSystemPrompt(
  role: string,
  memory: { recentSearches: string[]; topCategories: string[]; aiOpenCount: number },
  ctx: { screen?: string; productId?: string; sellerId?: string; transactionId?: string } | undefined,
): string {
  const lines: string[] = [SYSTEM_PROMPT];
  lines.push(`\nUser role: ${role}`);
  if (memory.topCategories.length > 0) {
    lines.push(`User's frequent categories: ${memory.topCategories.join(", ")}`);
  }
  if (memory.recentSearches.length > 0) {
    lines.push(`User's recent searches: ${memory.recentSearches.slice(0, 5).join(", ")}`);
  }
  if (ctx) {
    const c: string[] = [];
    if (ctx.screen) c.push(`screen=${ctx.screen}`);
    if (ctx.productId) c.push(`productId=${ctx.productId}`);
    if (ctx.sellerId) c.push(`sellerId=${ctx.sellerId}`);
    if (ctx.transactionId) c.push(`transactionId=${ctx.transactionId}`);
    if (c.length > 0) lines.push(`Active context: ${c.join(", ")}`);
  }
  return lines.join("\n");
}

async function callLlm(
  systemPrompt: string,
  userMessage: string,
  app: FastifyInstance,
): Promise<string> {
  // Try the existing LLM call via a lazy dynamic import so the
  // dependency stays optional. If anything fails, return a
  // deterministic but useful mock.
  try {
    const aiProvider = (process.env.AI_PROVIDER ?? "").toLowerCase();
    if (!aiProvider || !process.env.LLM_API_KEY) {
      return deterministicMock(systemPrompt, userMessage);
    }
    // Use the LLM via OpenAI-compatible chat completions if the
    // provider is groq/openai/openrouter. For gemini we use a
    // different endpoint. The user can plug the key into the env
    // and the route works.
    if (aiProvider === "gemini") {
      return await callGemini(systemPrompt, userMessage);
    }
    return await callOpenAICompatible(systemPrompt, userMessage, aiProvider);
  } catch (err) {
    app.log.warn({ err: (err as Error).message }, "llm call failed; using mock");
    return deterministicMock(systemPrompt, userMessage);
  }
}

async function callOpenAICompatible(
  system: string,
  user: string,
  provider: string,
): Promise<string> {
  const baseUrls: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    groq: "https://api.groq.com/openai/v1",
    openrouter: "https://openrouter.ai/api/v1",
    apifreellm: "https://apifreellm.com/api/v1",
  };
  const models: Record<string, string> = {
    openai: "gpt-4o-mini",
    groq: "llama-3.1-8b-instant",
    openrouter: "openrouter/auto",
    apifreellm: "apifreellm",
  };
  const url = (baseUrls[provider] ?? baseUrls.groq!) + "/chat/completions";
  const model = process.env.AI_MODEL || models[provider] || models.groq!;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      max_tokens: 800,
    }),
  });
  if (!r.ok) throw new Error(`llm_http_${r.status}`);
  const data = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? deterministicMock(system, user);
}

async function callGemini(system: string, user: string): Promise<string> {
  // Gemini: https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
  const model = process.env.AI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.LLM_API_KEY}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
    }),
  });
  if (!r.ok) throw new Error(`gemini_http_${r.status}`);
  const data = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? deterministicMock(system, user);
}

function deterministicMock(_system: string, user: string): string {
  // Friendly fallback when no LLM is configured. Tags the answer as
  // "AI suggestion" so the user knows it isn't a marketplace fact.
  const trimmed = user.trim().slice(0, 200);
  return `[AI suggestion — no LLM configured]\n\n` +
    `I received your question: "${trimmed}".\n\n` +
    `I can give a more useful answer once a language model is wired up. ` +
    `Set AI_PROVIDER=gemini (or openai/groq) and LLM_API_KEY in 12_Backend/.env, then restart the server. ` +
    `Until then I follow the hard rules from my system prompt and never invent marketplace data.`;
}
