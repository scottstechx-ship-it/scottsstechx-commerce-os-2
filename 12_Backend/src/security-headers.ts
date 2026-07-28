/**
 * Security headers — applied to every response.
 *
 * We don't pull in @fastify/helmet so the dependency footprint stays
 * small. The headers we set are the ones that matter for an API:
 *
 *   - X-Content-Type-Options: nosniff     (block MIME sniffing)
 *   - X-Frame-Options: DENY               (block clickjacking if any HTML is ever served)
 *   - Referrer-Policy: no-referrer        (don't leak our URLs to third parties)
 *   - Strict-Transport-Security: max-age=...  (force HTTPS, only in non-dev)
 *   - Cache-Control: no-store             (private API responses should not be cached)
 *   - Cross-Origin-Opener-Policy: same-origin
 *   - Cross-Origin-Resource-Policy: same-site
 *
 * CORS is handled separately, in registerCors().
 */

import type { FastifyInstance } from "fastify";

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function registerSecurityHeaders(app: FastifyInstance): void {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Cross-Origin-Opener-Policy", "same-origin");
    reply.header("Cross-Origin-Resource-Policy", "same-site");
    reply.header("Cache-Control", "no-store");
    if (!isDev()) {
      // 1 year HSTS — only meaningful on HTTPS, but harmless to set.
      reply.header(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    }
  });
}
