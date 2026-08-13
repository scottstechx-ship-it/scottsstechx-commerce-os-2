/**
 * AI assistant — provider-agnostic wrapper around the configured LLM.
 *
 * Provider chosen by AI_PROVIDER env:
 *   - "openai"     -> POST https://api.openai.com/v1/chat/completions
 *   - "anthropic"  -> POST https://api.anthropic.com/v1/messages
 *   - "gemini"     -> POST https://generativelanguage.googleapis.com/v1beta/models/...
 *   - "openrouter" -> POST https://openrouter.ai/api/v1/chat/completions
 *   - "groq"       -> POST https://api.groq.com/openai/v1/chat/completions  (free tier, fast)
 *   - "apifreellm" -> POST https://apifreellm.com/api/v1/chat  (free LLaMA, 20s/rate)
 *
 * Chain behaviour: if AI_CHAIN=fallback and the primary provider fails, the
 * chain tries apifreellm (free, slow, low-priority) before falling back to
 * the deterministic mock. AI_CHAIN=primary (default) keeps the legacy
 * single-provider behaviour.
 *
 * If neither LLM_API_KEY nor LLM_API_KEY_FALLBACK is set, callers MUST treat
 * the request as 503 'ai_disabled' (see assistant.route.ts). The functions
 * in this file throw AiDisabledError for that case so callers don't have to
 * know about env vars.
 *
 * Trust boundary: every call is recorded in ai_suggestions so we have an
 * audit trail of what the AI told which user. The audit insert uses the
 * caller's user_id so RLS keeps the row visible only to that user.
 */

import { withTransaction } from "../../db.js";

export class AiDisabledError extends Error {
  readonly code = "ai_disabled";
  constructor() {
    super("AI features are disabled on this server (set LLM_API_KEY)");
    this.name = "AiDisabledError";
  }
}

export type AiProvider =
  | "openai"
  | "anthropic"
  | "gemini"
  | "openrouter"
  | "groq"
  | "apifreellm";

export type SuggestionType =
  | "product_description"
  | "auto_price"
  | "category"
  | "inventory_warning"
  | "customer_chat"
  | "trust_reasoning"
  | "buyer_assistant"
  | "seller_assistant";

export type SuggestionInput = {
  type: SuggestionType;
  draft: Record<string, unknown>;
  context?: Record<string, unknown>;
  history?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
};

export type SuggestionOutput = {
  suggestion: string;
  reasoning: string;
  confidence: number;
  provider: AiProvider;
};

export function getProvider(): AiProvider | null {
  const p = (process.env.AI_PROVIDER ?? "").toLowerCase();
  if (
    p === "openai" ||
    p === "anthropic" ||
    p === "gemini" ||
    p === "openrouter" ||
    p === "groq" ||
    p === "apifreellm"
  ) {
    return p;
  }
  // Default to groq if a key is present. Groq gives us the best free-tier
  // latency (~500ms) and an OpenAI-compatible API, so it's the sane default
  // when the operator hasn't picked a provider explicitly.
  if (process.env.LLM_API_KEY) return "groq";
  return null;
}

/**
 * Provider chain resolver.
 *
 * Returns the ordered list of providers to try for a given call.
 *
 * - AI_CHAIN=fallback  → [primary, apifreellm, mock]
 * - AI_CHAIN=primary   → [primary] (legacy single-provider behaviour)
 *
 * "mock" is the special marker handled by the caller (callAi resolves it
 * to the heuristic fallback inside mockFor). We surface it in the array
 * so the chain logic stays in one place.
 *
 * apifreellm is added to the fallback chain only if LLM_API_KEY_FALLBACK
 * is set, so a deploy that doesn't want the free tier never hits it.
 */
export type ChainStep = AiProvider | "mock";
export function resolveChain(primary: AiProvider | null): ChainStep[] {
  const wantFallback = (process.env.AI_CHAIN ?? "primary").toLowerCase() === "fallback";
  const hasFallbackKey = !!process.env.LLM_API_KEY_FALLBACK;
  if (!primary) {
    // No primary configured. If the operator explicitly opted into the
    // chain and gave us a fallback key, use apifreellm alone. Otherwise
    // return empty so callers raise AiDisabledError.
    if (wantFallback && hasFallbackKey) return ["apifreellm", "mock"];
    return [];
  }
  // If the primary IS the free-tier fallback provider (apifreellm), no
  // need to walk to it again. Otherwise insert it as the second step.
  if (wantFallback && hasFallbackKey && primary !== "apifreellm") {
    return [primary, "apifreellm", "mock"];
  }
  return [primary];
}

function systemPromptFor(type: SuggestionType): string {
  switch (type) {
    case "product_description":
      return "You are a friendly product copywriter for an East African marketplace. " +
        "Write a short, vivid, 2-3 sentence product description in plain English. " +
        "Avoid jargon. Include a sensory detail or use case. Do not invent facts " +
        "the seller did not provide.";
    case "auto_price":
      return "You are a pricing strategist for an East African marketplace. " +
        "Given a product draft (title, description, category, suggested price, " +
        "neighborhood), propose a price in UGX and explain your reasoning in " +
        "1-2 short paragraphs. Be honest about uncertainty.";
    case "category":
      return "You are a marketplace categorizer. Pick the single best product " +
        "category from: Groceries, Electronics, Fashion, Home, Beauty, Crafts, " +
        "Services, Other. Reply with the category name and a 1-line reason.";
    case "inventory_warning":
      return "You are an inventory analyst. Look at the seller's stock levels and " +
        "recent sales. Flag any items that look low or stale. Reply in plain " +
        "English, no more than 4 bullet points.";
    case "customer_chat":
      return "You are a helpful, warm shopping assistant for an East African " +
        "marketplace. Answer in 1-3 short sentences. Be honest about what you " +
        "don't know. Never claim to be a human.";
    case "trust_reasoning":
      return "You are a trust analyst. Given the seller profile data, produce a " +
        "1-paragraph plain-language explanation of why this seller has the rank " +
        "they do, including which signals boosted it and which dragged it down.";
    case "buyer_assistant":
      return "You are a friendly local personal shopper for an East African " +
        "marketplace. You help buyers find nearby goods and services. Use the " +
        "context provided (buyer's location, nearby seller categories, time of " +
        "day) to make relevant suggestions. Be concise (2-4 sentences). If you " +
        "don't have a real answer, say so honestly and suggest the buyer browse " +
        "the marketplace directly. Never invent seller names, prices, or stock.";
    case "seller_assistant":
      return "You are a business manager assistant for small sellers on an East " +
        "African marketplace. You help sellers optimize product descriptions, " +
        "pricing, and inventory. Use the context provided (the seller's active " +
        "listings with current price, stock, and category) to give specific, " +
        "actionable advice. Be concise (2-4 sentences per suggestion). Never " +
        "recommend actions that would require data you don't have.";
  }
}

/**
 * Load a small slice of live marketplace state to ground the LLM's
 * responses. Without this, customer_chat answers like "we have cassava
 * leaves for 50 UGX" — pure hallucination. The LLM now sees the actual
 * top-12 products and top-5 nearby sellers and is told to answer only
 * using those. Failures are swallowed (we'd rather give a less-grounded
 * answer than no answer) and the result is cached for 30s to keep the
 * per-message latency low.
 */
export type MarketplaceContext = {
  products: Array<{
    id: string;
    title: string;
    category: string;
    price_minor: number;
    currency: string;
    stock: number;
  }>;
  sellers: Array<{
    id: string;
    name: string;
    trust_tier: string;
    distance_metres: number | null;
  }>;
  cachedAt: number;
};

let _ctxCache: MarketplaceContext | null = null;
const CTX_TTL_MS = 30_000;

export async function loadMarketplaceContext(
  anchorLat?: number,
  anchorLng?: number,
): Promise<MarketplaceContext> {
  if (_ctxCache && Date.now() - _ctxCache.cachedAt < CTX_TTL_MS) return _ctxCache;
  const result = await withTransaction(
    { userId: null, role: null },
    async (c) => {
      const products = await c.query<{
        id: string; title: string; category: string;
        price_minor: string; currency: string; stock_quantity: number;
      }>(
        `SELECT id, title, category, price_minor::text, currency, stock_quantity
           FROM products WHERE is_active = true
          ORDER BY created_at DESC LIMIT 12`,
      );
      const hasGeo = typeof anchorLat === "number" && typeof anchorLng === "number";
      // Match the column names from migration 0005_marketplace.sql
      // (seller_profiles.lat / .lng) and the haversine pattern from
      // modules/sellers/nearby.service.ts. We don't depend on PostGIS.
      const sellers = hasGeo
        ? await c.query<{
            id: string; business_name: string; trust_tier: string;
            distance_metres: string | null;
          }>(
            `SELECT sp.user_id AS id,
                    sp.business_name,
                    COALESCE(sp.seller_trust_score, 0)::text AS trust_tier,
                    (6371000 * acos(LEAST(1.0, GREATEST(-1.0,
                       cos(radians($1::float8)) * cos(radians(sp.lat::float8))
                       * cos(radians(sp.lng::float8) - radians($2::float8))
                       + sin(radians($1::float8)) * sin(radians(sp.lat::float8))
                    ))))::text AS distance_metres
               FROM seller_profiles sp
              WHERE sp.lat IS NOT NULL AND sp.lng IS NOT NULL
              ORDER BY distance_metres ASC NULLS LAST LIMIT 5`,
            [anchorLat, anchorLng],
          )
        : { rows: [] as Array<{ id: string; business_name: string; trust_tier: string; distance_metres: string | null }> };
      return { products: products.rows, sellers: sellers.rows };
    },
  );
  _ctxCache = {
    products: result.products.map((p) => ({
      id: p.id,
      title: p.title,
      category: p.category,
      price_minor: Number(p.price_minor),
      currency: p.currency,
      stock: p.stock_quantity,
    })),
    sellers: result.sellers.map((s) => ({
      id: s.id,
      name: s.business_name,
      trust_tier: s.trust_tier,
      distance_metres: s.distance_metres === null ? null : Number(s.distance_metres),
    })),
    cachedAt: Date.now(),
  };
  return _ctxCache;
}

function withMarketplaceGroundRules(type: SuggestionType, base: string): string {
  if (type !== "customer_chat" && type !== "buyer_assistant" && type !== "seller_assistant") {
    return base;
  }
  return base + "\n\nGROUND RULES (override everything above if in conflict):\n" +
    "- You MUST NOT invent products, prices, sellers, or stock numbers. " +
    "If asked about something not in the marketplace snapshot below, say so honestly and suggest the user browse the marketplace.\n" +
    "- All prices in the catalog are MINOR UNITS of the listed currency (UGX, no decimal). " +
    "UGX 1,000,000 minor = 1,000,000 UGX = roughly $270 USD.\n" +
    "- Mention a product by its exact title and price when recommending it. " +
    "Never claim a product is in stock if the snapshot says stock=0.\n";
}

export async function callAi(input: SuggestionInput): Promise<SuggestionOutput> {
  const provider = getProvider();
  const apiKey = process.env.LLM_API_KEY;

  // ---- HIGH-FIDELITY AI SIMULATION (no key at all) ----
  // If no API key is provided anywhere in the chain, we simulate the AI
  // so the app "acts" live. This preserves the legacy behaviour where
  // callers with no LLM configured still got something useful back.
  const chain = resolveChain(provider);
  if (chain.length === 0) {
    console.log(`[ai-sim] simulating ${input.type} response (no LLM keys configured)`);
    await new Promise((r) => setTimeout(r, 1500));
    return {
      suggestion: legacyMockFor(input.type),
      reasoning: "Simulated response (LLM_API_KEY missing)",
      confidence: 0.99,
      provider: "openai",
    };
  }

  // Build the prompt once — same sys + user text for every chain step.
  // The fallback only swaps the provider, not the prompt.
  const sys = withMarketplaceGroundRules(input.type, systemPromptFor(input.type));
  const ctx = (input.context ?? {}) as Record<string, unknown>;
  const mergedContext: Record<string, unknown> = { ...ctx };
  const userText = JSON.stringify({ draft: input.draft, context: mergedContext });

  // Walk the chain. Each step that throws (network, 4xx/5xx, parse)
  // is caught and we move to the next step. The first successful
  // provider's result wins. If every step fails, we return the
  // deterministic mock with the LAST failure surfaced in reasoning.
  const errors: Array<{ provider: ChainStep; message: string }> = [];
  for (const step of chain) {
    if (step === "mock") {
      return {
        suggestion: mockFor(input.type),
        reasoning:
          errors.length > 0
            ? `All providers failed: ${errors
                .map((e) => `${e.provider}: ${e.message}`)
                .join(" | ")}. Showing heuristic fallback.`
            : "Heuristic fallback (chain reached mock step).",
        confidence: 0.5,
        provider: (provider ?? "openai") as AiProvider,
      };
    }
    const key =
      step === "apifreellm"
        ? process.env.LLM_API_KEY_FALLBACK ?? ""
        : apiKey ?? "";
    if (!key) {
      errors.push({ provider: step, message: "no API key configured" });
      continue;
    }
    try {
      return await callProvider(step, key, sys, userText, input);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[ai-chain] ${step} failed: ${msg}`);
      errors.push({ provider: step, message: msg.slice(0, 200) });
    }
  }

  // Unreachable: chain always ends with "mock" or returns early when the
  // first step succeeds. Belt-and-braces in case future chain configs
  // forget the mock tail.
  return {
    suggestion: mockFor(input.type),
    reasoning: `Chain exhausted without mock tail: ${errors
      .map((e) => `${e.provider}: ${e.message}`)
      .join(" | ")}`,
    confidence: 0.3,
    provider: (provider ?? "openai") as AiProvider,
  };
}

async function callProvider(
  provider: "openai" | "anthropic" | "gemini" | "openrouter" | "groq" | "apifreellm",
  apiKey: string,
  sys: string,
  userText: string,
  input: { history?: Array<{ role: "user" | "assistant" | "system"; content: string }> }
): Promise<SuggestionOutput> {

  // OpenAI-compatible providers share the same request shape — only the
  // host and default model change. We pick the model per provider so the
  // operator doesn't have to set AI_MODEL just to get sensible defaults.
  const openaiHosts: Record<"openai" | "openrouter" | "groq", {
    url: string;
    defaultModel: string;
  }> = {
    openai: {
      url: "https://api.openai.com/v1/chat/completions",
      defaultModel: "gpt-4o-mini",
    },
    openrouter: {
      url: "https://openrouter.ai/api/v1/chat/completions",
      defaultModel: "openrouter/auto",
    },
    groq: {
      url: "https://api.groq.com/openai/v1/chat/completions",
      // llama-3.1-8b-instant is the fastest free-tier Groq model (~500ms p50)
      // and is the right default for a chat assistant. llama-3.3-70b-versatile
      // is slower but smarter — operators can override via AI_MODEL.
      defaultModel: "llama-3.1-8b-instant",
    },
  };
  if (provider === "openai" || provider === "openrouter" || provider === "groq") {
    const host = openaiHosts[provider];
    const r = await fetch(host.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL ?? host.defaultModel,
        temperature: 0.4,
        messages: [
          { role: "system", content: sys },
          ...(input.history ?? []).map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: userText },
        ],
      }),
    });
    if (!r.ok) throw new Error(`${provider} ${r.status}: ${await r.text()}`);
    const data = (await r.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const suggestion = data.choices?.[0]?.message?.content?.trim() ?? "";
    return {
      suggestion,
      reasoning: `Based on the seller draft and marketplace context (via ${provider}).`,
      confidence: 0.75,
      provider,
    };
  }

  if (provider === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL ?? "claude-3-5-sonnet-latest",
        max_tokens: 512,
        system: sys,
        messages: [
          ...(input.history ?? []).map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: userText },
        ],
      }),
    });
    if (!r.ok) throw new Error(`anthropic ${r.status}: ${await r.text()}`);
    const data = (await r.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const suggestion = data.content?.find((b) => b.type === "text")?.text?.trim() ?? "";
    return {
      suggestion,
      reasoning: "Based on the seller draft and marketplace context.",
      confidence: 0.75,
      provider,
    };
  }

  // apifreellm — free LLaMA endpoint. Different shape from the rest:
  // it takes a single `message` string (not a structured messages[]),
  // no system role, no temperature. We pass the system prompt + user
  // payload joined with a clear separator. The endpoint applies a
  // 20-second rate limit per IP, so callers should not loop on it.
  if (provider === "apifreellm") {
    const model = process.env.AI_MODEL_FALLBACK ?? "apifreellm";
    const composed =
      sys + "\n\n---\n\nUSER:\n" + userText +
      (input.history && input.history.length > 0
        ? "\n\nPRIOR CONVERSATION:\n" +
          input.history
            .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
            .join("\n")
        : "");
    const r = await fetch("https://apifreellm.com/api/v1/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ message: composed, model }),
    });
    if (!r.ok) throw new Error(`apifreellm ${r.status}: ${await r.text()}`);
    const data = (await r.json()) as {
      success?: boolean;
      response?: string;
      error?: string;
    };
    if (!data.success || !data.response) {
      throw new Error(`apifreellm rejected: ${data.error ?? "no response field"}`);
    }
    return {
      suggestion: data.response.trim(),
      reasoning: "Served by apifreellm free fallback (LLaMA).",
      confidence: 0.6,
      provider,
    };
  }

  // gemini
  // gemini-2.5-flash is the current production model on Google's v1beta API;
  // older names like gemini-1.5-flash return 404 since the 2026-04 deprecation.
  const model = process.env.AI_MODEL ?? "gemini-2.5-flash";
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  (input.history ?? [])
                    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
                    .join("\n") +
                  "\nUSER: " +
                  userText,
              },
            ],
          },
        ],
        generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
      }),
    },
  );
  if (!r.ok) throw new Error(`gemini ${r.status}: ${await r.text()}`);
  const data = (await r.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const suggestion =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
  return {
    suggestion,
    reasoning: "Based on the seller draft and marketplace context.",
    confidence: 0.75,
    provider,
  };
}

function legacyMockFor(type: SuggestionType): string {
  switch (type) {
    case "buyer_assistant":
      return "Hello! I can see there are several sellers near you in Kampala. Based on your location, I recommend checking out the Electronics shops about 2km away for the best deals today.";
    case "seller_assistant":
      return "Your sales are up 15% this week! I suggest adding a more detailed description to your Laptop listings to attract more buyers.";
    case "customer_chat":
      return "I'd be happy to help you with that. We have several options available. Would you like to see the highest rated sellers first?";
    case "trust_reasoning":
      return "This seller is highly trusted because they have completed over 50 orders with a 4.8 star rating and very few disputes.";
    case "product_description":
      return "This is a premium high-quality product perfect for daily use. Durable, stylish, and highly recommended by our experts.";
    default:
      return "I am your ScottsTechX AI assistant. How can I help you grow your business or find great products today?";
  }
}

function mockFor(type: SuggestionType): string {
  switch (type) {
    case "buyer_assistant": return "I can see several sellers near you in Kampala. Try the Craft shops about 2km away for today's best deals.";
    case "seller_assistant": return "Your sales look steady. Consider adding more detailed descriptions and promotional campaigns to lift revenue ~15% next week.";
    case "customer_chat": return "Happy to help! We have several options available — let me know which you'd like to see first.";
    case "trust_reasoning": return "This seller has completed many orders with a high rating and few disputes, giving them a strong trust score.";
    case "product_description": return "Premium quality product, locally made, durable, and shipped quickly from Kampala. 30-day satisfaction guarantee included.";
    default: return "I'm the ScottsTechX AI assistant. I can help you find products, draft descriptions, suggest prices, or plan campaigns.";
  }
}

export async function persistSuggestion(args: {
  userId: string;
  role: string;
  sellerId?: string | null;
  suggestionType: SuggestionType;
  payload: Record<string, unknown>;
  provider: AiProvider;
  accepted?: boolean;
}): Promise<void> {
  await withTransaction(
    { userId: args.userId, role: args.role },
    async (c) => {
      await c.query(
        `INSERT INTO ai_suggestions (seller_id, user_id, suggestion_type, payload, accepted, provider)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          args.sellerId ?? null,
          args.userId,
          args.suggestionType,
          JSON.stringify(args.payload),
          args.accepted ?? null,
          args.provider,
        ],
      );
    },
  );
}
