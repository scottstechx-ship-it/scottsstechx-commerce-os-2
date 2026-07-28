/**
 * In-process rate limiter.
 *
 * We avoid adding @fastify/rate-limit as a dep because the embedded
 * postgres stack runs single-process and we already have the counters
 * we need. For multi-instance production, swap this for @fastify/rate-limit
 * with Redis storage — the interface here matches.
 *
 * Limits:
 *   - AI endpoints: 60 req/min per key
 *   - everything else: 600 req/min per key
 *
 * Key:
 *   - Bearer token subject if present, else X-Forwarded-For, else IP.
 */

import type { FastifyInstance, FastifyRequest } from "fastify";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function keyFor(request: FastifyRequest): string {
  const auth = request.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    // Use the token's "sub" if we can decode it without verifying —
    // for rate limiting, a malformed token is fine to bucket by.
    try {
      const parts = auth.slice("Bearer ".length).split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(
          Buffer.from(parts[1]!, "base64url").toString("utf-8"),
        ) as { sub?: string };
        if (typeof payload.sub === "string") return `sub:${payload.sub}`;
      }
    } catch {
      /* fall through */
    }
  }
  const fwd = request.headers["x-forwarded-for"];
  if (typeof fwd === "string") {
    const ip = fwd.split(",")[0]!.trim();
    if (ip) return `ip:${ip}`;
  }
  return `ip:${request.ip}`;
}

function take(key: string, limit: number): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    return { allowed: true, retryAfter: 0 };
  }
  if (bucket.count >= limit) {
    return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { allowed: true, retryAfter: 0 };
}

// GC stale buckets every 5 minutes.
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}, 5 * 60 * 1000).unref?.();

export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (request, reply) => {
    const url = request.url;
    let limit = 600;
    if (url.startsWith("/api/v1/ai/")) {
      limit = 60;
    }
    const key = keyFor(request);
    const r = take(key, limit);
    if (!r.allowed) {
      reply
        .status(429)
        .header("retry-after", String(r.retryAfter))
        .header("x-ratelimit-limit", String(limit))
        .header("x-ratelimit-remaining", "0")
        .send({
          error: "rate_limited",
          message: `Too many requests. Retry in ${r.retryAfter}s.`,
        });
      return reply;
    }
    reply.header("x-ratelimit-limit", String(limit));
    reply.header(
      "x-ratelimit-remaining",
      String(Math.max(0, limit - (buckets.get(key)?.count ?? 0))),
    );
  });
}
