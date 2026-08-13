import type { FastifyInstance } from "fastify";
import { getPool } from "../../db.js";
import { nearbyQuerySchema } from "./nearby.schema.js";
import {
  findNearbySellers,
  tierFor,
  distanceScore,
  rankScore,
  type SellerNearbyEntry,
} from "./nearby.service.js";

export async function registerNearbyRoute(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/v1/sellers/nearby",
    async (request, reply) => {
      const q = nearbyQuerySchema.parse(request.query);
      const rows = await findNearbySellers(getPool(), q);
      const enriched: SellerNearbyEntry[] = rows.map((r) => {
        const trust = Number(r.trust_score);
        const rating = Number(r.rating_avg);
        const dScore = distanceScore(r.distance_metres, q.radiusKm);
        const rank = rankScore({
          distanceScore: dScore,
          trustScore: trust,
          ratingAvg: rating,
          ratingCount: r.rating_count,
          productCount: r.product_count,
          activeOrderCount: r.active_order_count,
        });
        return {
          sellerId: r.seller_id,
          displayName: r.display_name,
          businessName: r.business_name,
          avatarUrl: r.avatar_url,
          trustTier: tierFor(trust),
          trustScore: trust,
          distanceMetres: Math.round(r.distance_metres),
          rankScore: rank,
          productCount: r.product_count,
          activeOrderCount: r.active_order_count,
          ratingAvg: rating,
          ratingCount: r.rating_count,
          isVerified: r.is_verified,
        };
      });
      enriched.sort((a, b) => b.rankScore - a.rankScore);
      reply.send(enriched);
    },
  );
}
