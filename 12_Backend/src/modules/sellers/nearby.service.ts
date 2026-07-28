/**
 * Nearby-sellers query: Haversine distance + composite rank score.
 *
 * The rank score blends four signals on a common 0..100 scale and
 * weights sum to 1.0 by construction. The weights live here as a single
 * source of truth so the API and the test fixture agree.
 *
 * Why server-side: the client must never re-implement the ranking
 * formula. Trust signals (Ssec, Stx) are private to the seller_profiles
 * row; distance is a SQL operation; activity requires joining to orders.
 * Pushing this to the client leaks trust internals and lets a tampered
 * client lie about a seller's score.
 */

import type { Pool, PoolClient } from "pg";

export const NEARBY_WEIGHTS = {
  distance: 0.30,
  trust: 0.35,
  rating: 0.20,
  activity: 0.15,
} as const;

/** Either a Pool or a PoolClient — both have .query(). */
export type QueryExecutor = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type SellerNearbyRow = {
  seller_id: string;
  display_name: string;
  business_name: string;
  avatar_url: string | null;
  trust_score: string; // numeric comes back as string
  lat: number;
  lng: number;
  distance_metres: number;
  product_count: number;
  active_order_count: number;
  rating_avg: string;
  rating_count: number;
  is_verified: boolean;
};

export type SellerNearbyEntry = {
  sellerId: string;
  displayName: string;
  businessName: string;
  avatarUrl: string | null;
  trustTier: "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";
  trustScore: number;
  distanceMetres: number;
  rankScore: number;
  productCount: number;
  activeOrderCount: number;
  ratingAvg: number;
  ratingCount: number;
  isVerified: boolean;
};

/**
 * Trust tier from a 0..100 trust score. Boundaries match the README.
 *   <50  -> BRONZE
 *   <70  -> SILVER
 *   <85  -> GOLD
 *   >=85 -> PLATINUM
 */
export function tierFor(trustScore: number): SellerNearbyEntry["trustTier"] {
  if (trustScore >= 85) return "PLATINUM";
  if (trustScore >= 70) return "GOLD";
  if (trustScore >= 50) return "SILVER";
  return "BRONZE";
}

/**
 * Linear distance score: 100 at 0m, 0 at radiusKm (or further). This
 * keeps distance a positive signal inside the radius and zero outside.
 */
export function distanceScore(metres: number, radiusKm: number): number {
  const radiusM = radiusKm * 1000;
  if (metres >= radiusM) return 0;
  return Math.round((1 - metres / radiusM) * 100 * 100) / 100;
}

/**
 * Composite rank score. All inputs already on 0..100 except distance
 * which is converted via distanceScore() before this is called.
 */
export function rankScore(input: {
  distanceScore: number;
  trustScore: number;
  ratingAvg: number; // 0..5
  ratingCount: number;
  productCount: number;
  activeOrderCount: number;
}): number {
  // Normalize rating 0..5 to 0..100.
  const ratingNorm = Math.max(0, Math.min(100, (input.ratingAvg / 5) * 100));
  // Activity: log-scaled order count, capped at 100.
  const activity =
    input.productCount > 0
      ? Math.min(100, Math.log10(input.activeOrderCount + 1) * 50)
      : 0;
  const raw =
    NEARBY_WEIGHTS.distance * input.distanceScore +
    NEARBY_WEIGHTS.trust * input.trustScore +
    NEARBY_WEIGHTS.rating * ratingNorm +
    NEARBY_WEIGHTS.activity * activity;
  return Math.round(raw * 100) / 100;
}

/**
 * Bounding-box prefilter, then exact Haversine. Returns rows ordered by
 * rankScore DESC. The bbox is a coarse gate; the Haversine sorts on the
 * real distance.
 */
export async function findNearbySellers(
  client: QueryExecutor,
  args: { lat: number; lng: number; radiusKm: number; limit: number },
): Promise<SellerNearbyRow[]> {
  const { lat, lng, radiusKm, limit } = args;
  // 1 degree of latitude ~= 111 km. Use a slightly larger bbox than the
  // radius to be safe (the Haversine still gates inside the radius).
  const deltaLat = radiusKm / 111.0;
  // longitude scales by cos(lat); clamp to a sane range.
  const cosLat = Math.max(0.000001, Math.cos((lat * Math.PI) / 180));
  const deltaLng = radiusKm / (111.0 * cosLat);

  const sql = `
    WITH bbox AS (
      SELECT sp.*
        FROM seller_profiles sp
       WHERE sp.lat IS NOT NULL AND sp.lng IS NOT NULL
         AND sp.lat BETWEEN $1::float8 - $3::float8 AND $1::float8 + $3::float8
         AND sp.lng BETWEEN $2::float8 - $4::float8 AND $2::float8 + $4::float8
    ),
    haversine AS (
      SELECT
        bbox.user_id                                                                AS seller_id,
        u.display_name                                                              AS display_name,
        bbox.business_name                                                          AS business_name,
        bbox.avatar_url                                                             AS avatar_url,
        bbox.seller_trust_score                                                     AS trust_score,
        bbox.lat                                                                    AS lat,
        bbox.lng                                                                    AS lng,
        (6371000 * acos(LEAST(1.0, GREATEST(-1.0,
            cos(radians($1::float8)) * cos(radians(bbox.lat::float8))
            * cos(radians(bbox.lng::float8) - radians($2::float8))
            + sin(radians($1::float8)) * sin(radians(bbox.lat::float8))
        ))))                                                                        AS distance_metres,
        COALESCE((
          SELECT COUNT(*) FROM products p
           WHERE p.seller_id = bbox.user_id AND p.is_active = true
        ), 0)::int                                                                  AS product_count,
        COALESCE((
          SELECT COUNT(*) FROM orders o
           WHERE o.seller_id = bbox.user_id
             AND o.status IN ('created','paid','assigned','picked_up')
        ), 0)::int                                                                  AS active_order_count,
        bbox.rating_avg                                                             AS rating_avg,
        bbox.total_reviews                                                          AS rating_count,
        bbox.is_verified                                                            AS is_verified
      FROM bbox
      JOIN users u ON u.id = bbox.user_id
    )
    SELECT *
      FROM haversine
     WHERE distance_metres <= $5::float8
     ORDER BY distance_metres ASC
     LIMIT $6
  `;

  const params = [lat, lng, deltaLat, deltaLng, radiusKm * 1000, limit];
  const res = await client.query<SellerNearbyRow>(sql, params);
  return res.rows;
}
