/**
 * Fastify route for POST /api/v1/logistics/pod
 */

import type { FastifyInstance } from "fastify";
import { podBodySchema } from "./pod.schema.js";
import { submitPod } from "./pod.service.js";
import { requireAuth, getAuthUser } from "../../auth.js";
import { BadRequestError } from "../../errors.js";

export async function registerPodRoute(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/v1/logistics/pod",
    {
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const idemKey = request.headers["idempotency-key"];
      if (typeof idemKey !== "string" || idemKey.length < 8) {
        throw new BadRequestError("Idempotency-Key header required (>=8 chars)");
      }
      const body = podBodySchema.parse(request.body);
      const { status, body: responseBody } = await submitPod(user, idemKey, body);
      reply.status(status).send(responseBody);
    },
  );
}
