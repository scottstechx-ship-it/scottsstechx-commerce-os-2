import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { requireAuth, getAuthUser } from "../../auth.js";
import { withTransaction } from "../../db.js";
import { insertAuditLog } from "../audit/audit.js";

const createReviewSchema = z.object({
  sellerId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  body: z.string().min(1).max(2000).default(""),
});

export async function registerReviewRoute(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/v1/reviews",
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = getAuthUser(request);
      const body = createReviewSchema.parse(request.body);
      const review = await withTransaction(
        { userId: user.id, role: user.role },
        async (c) => {
          const exists = await c.query<{ user_id: string }>(
            `SELECT user_id FROM seller_profiles WHERE user_id = $1`,
            [body.sellerId],
          );
          if (exists.rowCount === 0) {
            return null;
          }
          const inserted = await c.query<{
            id: string;
            seller_id: string;
            reviewer_user_id: string;
            rating: number;
            body: string;
            created_at: string;
          }>(
            `INSERT INTO seller_reviews (seller_id, reviewer_user_id, rating, body)
             VALUES ($1, $2, $3, $4)
             RETURNING id, seller_id, reviewer_user_id, rating, body, created_at`,
            [body.sellerId, user.id, body.rating, body.body],
          );
          await c.query(
            `UPDATE seller_profiles
                SET rating_avg = COALESCE(
                      (SELECT ROUND(AVG(rating)::numeric, 2) FROM seller_reviews
                        WHERE seller_id = $1), 0),
                    total_reviews = (
                      SELECT COUNT(*) FROM seller_reviews WHERE seller_id = $1)
              WHERE user_id = $1`,
            [body.sellerId],
          );
          await insertAuditLog(c, {
            actor_user_id: user.id,
            action: "review.create",
            resource_type: "seller",
            resource_id: body.sellerId,
            payload: { rating: body.rating },
          });
          return inserted.rows[0]!;
        },
      );
      if (!review) {
        reply.status(404).send({ error: "not_found", message: "seller not found" });
        return;
      }
      reply.status(201).send(review);
    },
  );
}
