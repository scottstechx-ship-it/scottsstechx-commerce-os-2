import type { FastifyInstance } from "fastify";
import { requireAuth, getAuthUser } from "../../auth.js";
import { withTransaction } from "../../db.js";
import { ForbiddenError } from "../../errors.js";
import { z } from "zod";

const sellerOrdersQuerySchema = z.object({
  status: z
    .enum([
      "created",
      "paid",
      "assigned",
      "picked_up",
      "delivered",
      "cancelled",
      "refunded",
    ])
    .optional(),
});

export type SellerStats = {
  sellerId: string;
  activeListings: number;
  totalListings: number;
  ordersToday: number;
  ordersThisWeek: number;
  revenueMinorToday: number;
  revenueMinorThisWeek: number;
  currency: string;
  averageRating: number;
  ratingCount: number;
};

export async function getSellerStats(
  user: import("../../auth.js").AuthUser,
): Promise<SellerStats> {
  if (user.role !== "seller") throw new ForbiddenError("sellers only");
  return withTransaction({ userId: user.id, role: user.role }, async (c) => {
    const counts = await c.query<{
      active: string;
      total: string;
      today: string;
      week: string;
      rev_today: string | null;
      rev_week: string | null;
      currency: string;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM products WHERE seller_id = $1 AND is_active = true)::text AS active,
         (SELECT COUNT(*) FROM products WHERE seller_id = $1)::text AS total,
         (SELECT COUNT(*) FROM orders WHERE seller_id = $1
            AND created_at >= date_trunc('day', now()))::text AS today,
         (SELECT COUNT(*) FROM orders WHERE seller_id = $1
            AND created_at >= date_trunc('week', now()))::text AS week,
         (SELECT COALESCE(SUM(total_minor),0)::text FROM orders WHERE seller_id = $1
            AND created_at >= date_trunc('day', now())) AS rev_today,
         (SELECT COALESCE(SUM(total_minor),0)::text FROM orders WHERE seller_id = $1
            AND created_at >= date_trunc('week', now())) AS rev_week,
         COALESCE(
           (SELECT currency FROM orders WHERE seller_id = $1
            ORDER BY created_at DESC LIMIT 1),
           'UGX'
         ) AS currency`,
      [user.id],
    );
    const row = counts.rows[0]!;
    const profile = await c.query<{
      rating_avg: string;
      total_reviews: number;
    }>(
      `SELECT rating_avg, total_reviews FROM seller_profiles WHERE user_id = $1`,
      [user.id],
    );
    const p = profile.rows[0] ?? { rating_avg: "0", total_reviews: 0 };
    return {
      sellerId: user.id,
      activeListings: Number(row.active),
      totalListings: Number(row.total),
      ordersToday: Number(row.today),
      ordersThisWeek: Number(row.week),
      revenueMinorToday: Number(row.rev_today ?? 0),
      revenueMinorThisWeek: Number(row.rev_week ?? 0),
      currency: row.currency,
      averageRating: Number(p.rating_avg),
      ratingCount: p.total_reviews,
    };
  });
}

export type SellerOrderRow = {
  orderId: string;
  customerId: string;
  customerName: string;
  totalMinor: number;
  currency: string;
  status: string;
  createdAt: string;
};

export async function listSellerOrders(
  user: import("../../auth.js").AuthUser,
  status?: string,
): Promise<SellerOrderRow[]> {
  if (user.role !== "seller") throw new ForbiddenError("sellers only");
  return withTransaction({ userId: user.id, role: user.role }, async (c) => {
    const params: unknown[] = [user.id];
    let sql = `SELECT o.id AS order_id, o.customer_id, u.display_name AS customer_name,
                      o.total_minor::text, o.currency, o.status, o.created_at
                 FROM orders o
                 JOIN users u ON u.id = o.customer_id
                WHERE o.seller_id = $1`;
    if (status) {
      sql += ` AND o.status = $2`;
      params.push(status);
    }
    sql += ` ORDER BY o.created_at DESC LIMIT 200`;
    const r = await c.query(sql, params);
    return r.rows.map((row) => ({
      orderId: row.order_id,
      customerId: row.customer_id,
      customerName: row.customer_name,
      totalMinor: Number(row.total_minor),
      currency: row.currency,
      status: row.status,
      createdAt: row.created_at,
    }));
  });
}

export async function registerDashboardRoute(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/v1/seller/stats",
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = getAuthUser(request);
      reply.send(await getSellerStats(user));
    },
  );

  app.get(
    "/api/v1/seller/orders",
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = getAuthUser(request);
      const q = sellerOrdersQuerySchema.parse(request.query);
      reply.send(await listSellerOrders(user, q.status));
    },
  );
}
