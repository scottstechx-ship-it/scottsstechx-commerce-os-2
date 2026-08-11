/**
 * Nearby V2 — real geolocation queries.
 *
 *   POST /api/v1/sellers/v2/update-location
 *     Body: { lat, lng, accuracyMeters?, city?, address? }
 *     The seller's own location. Stored on the `sellers` table and
 *     mirrored to Firestore /sellers/{id} for fast geo queries.
 *
 *   GET /api/v1/sellers/v2/nearby
 *     Query: ?lat&lng&radiusKm&category&minPrice&maxPrice&limit
 *     Returns sellers within the radius, ordered by distance, with
 *     their top products. The query is done with the Haversine
 *     formula in SQL using earthdistance(ll_to_earth(...)) (cube
 *     extension) or a fallback in JS. We use the cube extension
 *     because the project already enables it.
 */
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { requireAuthAny, getAuthUser } from "../../firebase/auth-middleware.js";
import { getPool } from "../../db.js";
import { mirrorToCollection } from "../../firebase/mirror.js";

const updateLocationSchema = z.object({
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  accuracyMeters: z.number().positive().max(100000).optional(),
  city: z.string().max(80).optional(),
  address: z.string().max(200).optional(),
});

const nearbyQuerySchema = z.object({
  lat: z.coerce.number().gte(-90).lte(90),
  lng: z.coerce.number().gte(-180).lte(180),
  radiusKm: z.coerce.number().positive().max(200).default(25),
  category: z.string().max(60).optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  limit: z.coerce.number().int().positive().max(100).default(40),
});

export async function registerNearbyV2Route(app: FastifyInstance): Promise<void> {
  // -----------------------------------------------------------------
  app.post(
    "/api/v1/sellers/v2/update-location",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const body = updateLocationSchema.parse(request.body);
      const pool = getPool();
      // Find this user's seller row
      const seller = await pool.query<{ id: string; store_name: string }>(
        `SELECT id, store_name FROM sellers WHERE user_id = $1`,
        [u.id],
      );
      if (seller.rows.length === 0) {
        reply.status(404).send({ error: "no_seller_profile" });
        return;
      }
      const sellerId = seller.rows[0]!.id;
      await pool.query(
        `UPDATE sellers
            SET lat = $1, lng = $2, city = COALESCE($3, city), address = COALESCE($4, address),
                location_updated_at = NOW()
          WHERE id = $5`,
        [body.lat, body.lng, body.city ?? null, body.address ?? null, sellerId],
      );
      // Mirror to Firestore
      await mirrorToCollection("sellers", sellerId, {
        id: sellerId,
        storeName: seller.rows[0]!.store_name,
        lat: body.lat,
        lng: body.lng,
        city: body.city ?? null,
        address: body.address ?? null,
        updatedAt: new Date().toISOString(),
      });
      reply.send({ ok: true, sellerId });
    },
  );

  // -----------------------------------------------------------------
  app.get(
    "/api/v1/sellers/v2/nearby",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const q = nearbyQuerySchema.parse(request.query);
      const pool = getPool();
      // Haversine via earthdistance extension (cube module). If not
      // installed we fall back to a SQL-side approximation.
      const cat = q.category;
      const minPrice = q.minPrice;
      const maxPrice = q.maxPrice;
      const sql = `
        WITH origin AS (
          SELECT ll_to_earth($1, $2) AS pt
        )
        SELECT
          s.id                AS seller_id,
          s.store_name        AS store_name,
          s.lat               AS lat,
          s.lng               AS lng,
          s.city              AS city,
          s.address           AS address,
          s.rating            AS rating,
          earth_distance(ll_to_earth(s.lat, s.lng), origin.pt) / 1000.0 AS distance_km,
          (
            SELECT json_agg(json_build_object(
              'id', p.id, 'title', p.title, 'price', p.price_minor,
              'image', p.image_url_signed, 'stock', p.stock,
              'rating', p.rating, 'category', p.category
            ) ORDER BY p.rating DESC NULLS LAST)
            FROM products p
            WHERE p.seller_id = s.id
              AND p.stock > 0
              ${cat ? "AND p.category = $4" : ""}
              ${minPrice != null ? `AND p.price_minor >= $${cat ? 5 : 4}` : ""}
              ${maxPrice != null ? `AND p.price_minor <= $${cat ? (minPrice != null ? 6 : 5) : (minPrice != null ? 5 : 4)}` : ""}
          ) AS products
        FROM sellers s, origin
        WHERE s.lat IS NOT NULL
          AND s.lng IS NOT NULL
          AND earth_box(ll_to_earth(s.lat, s.lng), $3 * 1000.0) @> origin.pt
          AND earth_distance(ll_to_earth(s.lat, s.lng), origin.pt) <= $3 * 1000.0
        ORDER BY distance_km ASC
        LIMIT $${cat ? (maxPrice != null ? 7 : (minPrice != null ? 6 : 5)) : (maxPrice != null ? 6 : (minPrice != null ? 5 : 4))}
      `;
      // Parameter list
      const params: unknown[] = [q.lat, q.lng, q.radiusKm];
      // param index counter
      if (cat) params.push(cat);
      if (minPrice != null) params.push(minPrice);
      if (maxPrice != null) params.push(maxPrice);
      params.push(q.limit);
      try {
        const r = await pool.query(sql, params);
        reply.send(r.rows);
      } catch (err) {
        // Fallback if cube extension is unavailable
        const fb = await fallbackHaversine(pool, q, cat, minPrice, maxPrice);
        reply.send(fb);
      }
    },
  );
}

async function fallbackHaversine(
  pool: ReturnType<typeof getPool>,
  q: { lat: number; lng: number; radiusKm: number; category?: string; minPrice?: number; maxPrice?: number; limit: number },
  cat: string | undefined,
  minPrice: number | undefined,
  maxPrice: number | undefined,
): Promise<unknown[]> {
  // Pure-JS Haversine. Slower but always works.
  const r = await pool.query<{
    seller_id: string;
    store_name: string;
    lat: number;
    lng: number;
    city: string | null;
    address: string | null;
    rating: number | null;
    products: unknown;
  }>(
    `SELECT s.id AS seller_id, s.store_name, s.lat, s.lng, s.city, s.address, s.rating,
            (SELECT json_agg(json_build_object(
                'id', p.id, 'title', p.title, 'price', p.price_minor,
                'image', p.image_url_signed, 'stock', p.stock,
                'rating', p.rating, 'category', p.category
              ) ORDER BY p.rating DESC NULLS LAST)
               FROM products p
              WHERE p.seller_id = s.id AND p.stock > 0
                ${cat ? "AND p.category = $1" : ""}
                ${minPrice != null ? `AND p.price_minor >= $${cat ? 2 : 1}` : ""}
                ${maxPrice != null ? `AND p.price_minor <= $${cat ? (minPrice != null ? 3 : 2) : (minPrice != null ? 2 : 1)}` : ""}
            ) AS products
       FROM sellers s
      WHERE s.lat IS NOT NULL AND s.lng IS NOT NULL`,
    [
      ...(cat ? [cat] : []),
      ...(minPrice != null ? [minPrice] : []),
      ...(maxPrice != null ? [maxPrice] : []),
    ],
  );
  const out: unknown[] = [];
  for (const row of r.rows) {
    const d = haversineKm(q.lat, q.lng, row.lat, row.lng);
    if (d <= q.radiusKm) {
      out.push({ ...row, distance_km: d });
    }
  }
  out.sort((a, b) => ((a as { distance_km: number }).distance_km - (b as { distance_km: number }).distance_km));
  return out.slice(0, q.limit);
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
