import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { requireAuth, getAuthUser } from "../../auth.js";
import { listUserOrders, getOrderById } from "./orders.service.js";
import { NotFoundError } from "../../errors.js";

const listOrdersQuerySchema = z.object({
  status: z.string().optional(),
});

const orderParamsSchema = z.object({
  orderId: z.string().uuid(),
});

export async function registerOrdersRoute(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/v1/orders",
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = getAuthUser(request);
      const q = listOrdersQuerySchema.parse(request.query);
      const orders = await listUserOrders(user.id, q.status);
      reply.send(orders);
    },
  );

  app.get(
    "/api/v1/orders/:orderId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = getAuthUser(request);
      const params = orderParamsSchema.parse(request.params);
      const order = await getOrderById(params.orderId, user.id);
      if (!order) throw new NotFoundError("Order not found");
      reply.send(order);
    },
  );
}
