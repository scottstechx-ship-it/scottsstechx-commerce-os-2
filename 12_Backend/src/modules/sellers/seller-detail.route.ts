import type { FastifyInstance } from "fastify";
import { getPool } from "../../db.js";
import { NotFoundError } from "../../errors.js";
import { sellerIdParamSchema } from "./seller-detail.schema.js";
import { findSellerDetail } from "./seller-detail.service.js";

export async function registerSellerDetailRoute(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    "/api/v1/sellers/:sellerId",
    async (request, reply) => {
      const { sellerId } = sellerIdParamSchema.parse(request.params);
      const detail = await findSellerDetail(getPool(), sellerId);
      if (!detail) throw new NotFoundError("seller not found");
      reply.send(detail);
    },
  );
}
