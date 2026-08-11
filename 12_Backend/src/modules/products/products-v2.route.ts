/**
 * Products V2 — image upload + Firestore mirror.
 *
 *   POST /api/v1/products/v2/upload-image-url
 *     Body: { productId, mime, ext }
 *     Returns a signed upload URL. The client PUTs the bytes there,
 *     then calls /products/v2/{id}/set-image to confirm the public URL.
 *
 *   POST /api/v1/products/v2/:id/set-image
 *     Body: { gsPath, width?, height?, alt? }
 *     Writes image_url_signed to the products row and mirrors the
 *     product to Firestore /products/{id}.
 *
 *   POST /api/v1/products/v2/:id/mirror
 *     Pushes the canonical product row to Firestore /products/{id}.
 *     Used after any product mutation so mobile clients see updates.
 */
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { requireAuthAny, getAuthUser } from "../../firebase/auth-middleware.js";
import { withTransaction, getPool } from "../../db.js";
import { signedUploadUrl, newProductImagePath } from "../../firebase/storage.js";
import { mirrorToCollection } from "../../firebase/mirror.js";

const uploadSchema = z.object({
  productId: z.string().uuid(),
  mime: z.string().min(3).max(100),
  ext: z.string().min(1).max(10),
});

const setImageSchema = z.object({
  gsPath: z.string().min(5).max(500),
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
  alt: z.string().max(200).optional(),
});

export async function registerProductsV2Route(app: FastifyInstance): Promise<void> {
  // -----------------------------------------------------------------
  app.post(
    "/api/v1/products/v2/upload-image-url",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      if (u.role !== "seller" && u.role !== "admin") {
        reply.status(403).send({ error: "seller_only" });
        return;
      }
      const body = uploadSchema.parse(request.body);
      // Verify the product belongs to the caller (unless admin)
      const pool = getPool();
      const own = await pool.query<{ id: string; seller_id: string }>(
        `SELECT id, seller_id FROM products WHERE id = $1`,
        [body.productId],
      );
      if (own.rows.length === 0) {
        reply.status(404).send({ error: "product_not_found" });
        return;
      }
      const sellerId = own.rows[0]!.seller_id;
      if (u.role !== "admin") {
        const ok = await pool.query<{ id: string }>(
          `SELECT id FROM sellers WHERE id = $1 AND user_id = $2`,
          [sellerId, u.id],
        );
        if (ok.rows.length === 0) {
          reply.status(403).send({ error: "not_your_product" });
          return;
        }
      }
      const objectPath = newProductImagePath(sellerId, body.productId, body.ext);
      const signed = await signedUploadUrl(objectPath, body.mime);
      reply.send({
        uploadUrl: signed.url,
        gsPath: signed.gsPath,
        publicUrl: signed.gsPath.replace("gs://", "https://storage.googleapis.com/"),
        expiresAt: signed.expiresAt,
      });
    },
  );

  // -----------------------------------------------------------------
  app.post(
    "/api/v1/products/v2/:id/set-image",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const params = request.params as { id: string };
      const body = setImageSchema.parse(request.body);
      await withTransaction({ userId: u.id, role: u.role }, async (c) => {
        await c.query(
          `UPDATE products
              SET image_url_signed = $1, updated_at = NOW()
            WHERE id = $2`,
          [body.gsPath, params.id],
        );
      });
      // Mirror to Firestore
      await mirrorToCollection("products", params.id, {
        imageUrlSigned: body.gsPath,
        updatedAt: new Date().toISOString(),
      });
      reply.send({ ok: true, imageUrl: body.gsPath });
    },
  );

  // -----------------------------------------------------------------
  app.post(
    "/api/v1/products/v2/:id/mirror",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const params = request.params as { id: string };
      const pool = getPool();
      const rows = await withTransaction({ userId: u.id, role: u.role }, async (c) => {
        const r = await c.query<{
          id: string;
          seller_id: string;
          title: string;
          description: string | null;
          category: string | null;
          price_minor: string | null;
          currency: string | null;
          stock: number | null;
          image_url_signed: string | null;
          rating: number | null;
          sales_count: number | null;
          created_at: string;
          updated_at: string;
        }>(
          `SELECT p.id, p.seller_id, p.title, p.description, p.category, p.price_minor, p.currency,
                  p.stock, p.image_url_signed, p.rating, p.sales_count, p.created_at, p.updated_at
             FROM products p
             JOIN sellers s ON s.id = p.seller_id
            WHERE p.id = $1 AND s.user_id = $2`,
          [params.id, u.id],
        );
        return r.rows;
      });
      if (rows.length === 0 && u.role !== "admin") {
        reply.status(404).send({ error: "product_not_found_or_not_owned" });
        return;
      }
      // Admin: fetch directly
      let row = rows[0];
      if (!row) {
        const r = await pool.query<{
          id: string;
          seller_id: string;
          title: string;
          description: string | null;
          category: string | null;
          price_minor: string | null;
          currency: string | null;
          stock: number | null;
          image_url_signed: string | null;
          rating: number | null;
          sales_count: number | null;
          created_at: string;
          updated_at: string;
        }>(
          `SELECT id, seller_id, title, description, category, price_minor, currency,
                  stock, image_url_signed, rating, sales_count, created_at, updated_at
             FROM products WHERE id = $1`,
          [params.id],
        );
        row = r.rows[0];
        if (!row) {
          reply.status(404).send({ error: "product_not_found" });
          return;
        }
      }
      await mirrorToCollection("products", row.id, {
        id: row.id,
        sellerId: row.seller_id,
        title: row.title,
        description: row.description,
        category: row.category,
        priceMinor: row.price_minor ? Number(row.price_minor) : null,
        currency: row.currency,
        stock: row.stock,
        imageUrlSigned: row.image_url_signed,
        rating: row.rating,
        salesCount: row.sales_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
      reply.send({ ok: true });
    },
  );
}
