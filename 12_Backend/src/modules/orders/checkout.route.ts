/**
 * Fastify route for POST /api/v1/orders/checkout
 */

import type { FastifyInstance } from "fastify";
import { checkoutBodySchema } from "./checkout.schema.js";
import { checkout } from "./checkout.service.js";
import { requireAuth, getAuthUser } from "../../auth.js";
import { BadRequestError } from "../../errors.js";

export async function registerCheckoutRoute(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/v1/orders/checkout",
    {
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const idemKey = request.headers["idempotency-key"];
      if (typeof idemKey !== "string" || idemKey.length < 8) {
        throw new BadRequestError("Idempotency-Key header required (>=8 chars)");
      }
      const body = checkoutBodySchema.parse(request.body);
      const { status, body: responseBody } = await checkout(user, idemKey, body);
      reply.status(status).send(responseBody);
    },
  );
}
