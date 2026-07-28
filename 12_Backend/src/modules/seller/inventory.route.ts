import type { FastifyInstance } from "fastify";
import { requireAuth, getAuthUser } from "../../auth.js";
import {
  createProductBodySchema,
  updateProductBodySchema,
  productIdParamSchema,
} from "./inventory.schema.js";
import {
  listInventory,
  createProduct,
  updateProduct,
  deleteProduct,
} from "./inventory.service.js";
import { BadRequestError } from "../../errors.js";

export async function registerInventoryRoute(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/v1/seller/inventory",
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = getAuthUser(request);
      const list = await listInventory(user);
      reply.send(list);
    },
  );

  app.post(
    "/api/v1/seller/inventory",
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = getAuthUser(request);
      const idem = request.headers["idempotency-key"];
      if (typeof idem !== "string") {
        throw new BadRequestError("Idempotency-Key header required");
      }
      const body = createProductBodySchema.parse(request.body);
      const created = await createProduct(user, idem, body);
      reply.status(201).send(created);
    },
  );

  app.patch(
    "/api/v1/seller/inventory/:productId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = getAuthUser(request);
      const idem = request.headers["idempotency-key"];
      if (typeof idem !== "string") {
        throw new BadRequestError("Idempotency-Key header required");
      }
      const { productId } = productIdParamSchema.parse(request.params);
      const body = updateProductBodySchema.parse(request.body);
      const updated = await updateProduct(user, idem, productId, body);
      reply.send(updated);
    },
  );

  app.delete(
    "/api/v1/seller/inventory/:productId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = getAuthUser(request);
      const idem = request.headers["idempotency-key"];
      if (typeof idem !== "string") {
        throw new BadRequestError("Idempotency-Key header required");
      }
      const { productId } = productIdParamSchema.parse(request.params);
      await deleteProduct(user, idem, productId);
      reply.status(204).send();
    },
  );
}
