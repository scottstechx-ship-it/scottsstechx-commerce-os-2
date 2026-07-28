/**
 * CORS — allow-list by env var.
 *
 * ALLOWED_ORIGINS is a comma-separated list of origins, e.g.
 *   ALLOWED_ORIGINS="https://admin.scottstechx.example,https://app.scottstechx.example"
 *
 * In development, all origins are allowed unless ALLOWED_ORIGINS is set.
 */

import type { FastifyInstance } from "fastify";

function allowedOrigins(): Set<string> | "*" {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw || raw.trim() === "") {
    return process.env.NODE_ENV === "production" ? new Set() : "*";
  }
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function registerCors(app: FastifyInstance): void {
  const allowed = allowedOrigins();
  app.addHook("onRequest", async (request, reply) => {
    // Fastify applies CORS only to non-same-origin requests.
    const origin = request.headers.origin;
    if (!origin) return;

    let allowedOrigin = "";
    if (allowed === "*") {
      allowedOrigin = "*";
    } else if (allowed.has(origin)) {
      allowedOrigin = origin;
    } else {
      // Not in the allow-list. We still set the header so the browser
      // can produce a precise error rather than guessing.
      return;
    }

    reply.header("Access-Control-Allow-Origin", allowedOrigin);
    reply.header("Vary", "Origin");
    reply.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    reply.header(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, Idempotency-Key, X-Stub-Reason",
    );
    reply.header("Access-Control-Max-Age", "600");

    if (request.method === "OPTIONS") {
      reply.status(204).send();
      return reply;
    }
  });
}
