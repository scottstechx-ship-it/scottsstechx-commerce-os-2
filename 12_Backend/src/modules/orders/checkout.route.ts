/**
 * Fastify route for POST /api/v1/orders/checkout
 */

import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { checkoutBodySchema } from "./checkout.schema.js";
import { checkout } from "./checkout.service.js";
import { requireAuth, getAuthUser } from "../../auth.js";

export async function registerCheckoutRoute(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/v1/orders/checkout",
    {
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      // Accept a client-supplied Idempotency-Key (>=8 chars) for true
      // idempotency, OR auto-derive one from (userId + body hash) so the
      // Android client (and ad-hoc curl/Postman) doesn't have to generate
      // a UUID for every checkout. The auto-derived key still gives
      // at-most-once semantics for the same payload because we hash the
      // body, but a malicious client cannot replay a *different* body
      // under the same key — the body-hash mismatch returns 409.
      const idemKey = (() => {
        const h = request.headers["idempotency-key"];
        if (typeof h === "string" && h.length >= 8) return h;
        return "auto-" + createHash("sha256")
          .update(user.id)
          .update(JSON.stringify(request.body ?? {}))
          .digest("hex");
      })();
      const body = checkoutBodySchema.parse(request.body);
      const { status, body: responseBody } = await checkout(user, idemKey, body);
      reply.status(status).send(responseBody);
    },
  );
}
