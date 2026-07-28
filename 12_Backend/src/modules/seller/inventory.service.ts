import { withTransaction } from "../../db.js";
import { ForbiddenError, NotFoundError, BadRequestError } from "../../errors.js";
import type { AuthUser } from "../../auth.js";
import { insertAuditLog } from "../audit/audit.js";
import type {
  CreateProductBody,
  UpdateProductBody,
} from "./inventory.schema.js";

export type InventoryProduct = {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  priceMinor: number;
  currency: string;
  stockQuantity: number;
  productTrustScore: number;
  imageUrl: string | null;
  isActive: boolean;
};

function rowToProduct(r: {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  price_minor: string;
  currency: string;
  stock_quantity: number;
  product_trust_score: string | null;
  image_url: string | null;
  is_active: boolean;
}): InventoryProduct {
  return {
    id: r.id,
    sellerId: r.seller_id,
    title: r.title,
    description: r.description,
    priceMinor: Number(r.price_minor),
    currency: r.currency,
    stockQuantity: r.stock_quantity,
    productTrustScore: Number(r.product_trust_score ?? "50"),
    imageUrl: r.image_url,
    isActive: r.is_active,
  };
}

export async function listInventory(user: AuthUser): Promise<InventoryProduct[]> {
  if (user.role !== "seller") throw new ForbiddenError("sellers only");
  return withTransaction({ userId: user.id, role: user.role }, async (c) => {
    const res = await c.query(
      `SELECT id, seller_id, title, description, price_minor::text, currency,
              stock_quantity, COALESCE(product_trust_score, 50)::text AS product_trust_score,
              NULL::text AS image_url, is_active
         FROM products
        WHERE seller_id = $1
        ORDER BY created_at DESC`,
      [user.id],
    );
    return res.rows.map(rowToProduct);
  });
}

export async function createProduct(
  user: AuthUser,
  idempotencyKey: string,
  body: CreateProductBody,
): Promise<InventoryProduct> {
  if (user.role !== "seller") throw new ForbiddenError("sellers only");
  if (!idempotencyKey || idempotencyKey.length < 8) {
    throw new BadRequestError("Idempotency-Key header required (>=8 chars)");
  }
  return withTransaction({ userId: user.id, role: user.role }, async (c) => {
    const res = await c.query<{
      id: string;
      seller_id: string;
      title: string;
      description: string;
      price_minor: string;
      currency: string;
      stock_quantity: number;
      product_trust_score: string | null;
      image_url: string | null;
      is_active: boolean;
    }>(
      `INSERT INTO products
         (seller_id, title, description, price_minor, currency, stock_quantity, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING id, seller_id, title, description, price_minor::text, currency,
                 stock_quantity, COALESCE(product_trust_score, 50)::text AS product_trust_score,
                 NULL::text AS image_url, is_active`,
      [user.id, body.title, body.description, body.priceMinor, body.currency, body.stockQuantity],
    );
    const row = res.rows[0]!;
    // imageUrl is per-product-media; we create a single media row when given.
    if (body.imageUrl) {
      await c.query(
        `INSERT INTO product_media (product_id, url, alt_text, position)
         VALUES ($1, $2, $3, 0)`,
        [row.id, body.imageUrl, body.title],
      );
    }
    await insertAuditLog(c, {
      actor_user_id: user.id,
      action: "product.create",
      resource_type: "product",
      resource_id: row.id,
      payload: { title: body.title, price_minor: body.priceMinor },
    });
    // Surface the persisted imageUrl by re-reading from product_media.
    const media = await c.query<{ url: string }>(
      `SELECT url FROM product_media WHERE product_id = $1 ORDER BY position LIMIT 1`,
      [row.id],
    );
    return rowToProduct({
      ...row,
      image_url: media.rows[0]?.url ?? null,
    });
  });
}

export async function updateProduct(
  user: AuthUser,
  idempotencyKey: string,
  productId: string,
  body: UpdateProductBody,
): Promise<InventoryProduct> {
  if (user.role !== "seller") throw new ForbiddenError("sellers only");
  if (!idempotencyKey || idempotencyKey.length < 8) {
    throw new BadRequestError("Idempotency-Key header required (>=8 chars)");
  }
  return withTransaction({ userId: user.id, role: user.role }, async (c) => {
    // Ownership check first.
    const owner = await c.query<{ seller_id: string }>(
      `SELECT seller_id FROM products WHERE id = $1`,
      [productId],
    );
    if (owner.rowCount === 0) throw new NotFoundError("product not found");
    if (owner.rows[0]!.seller_id !== user.id) {
      throw new ForbiddenError("not your product");
    }
    // Build the dynamic SET clause.
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 2; // $1 is productId
    if (body.title !== undefined) {
      sets.push(`title = $${i++}`);
      vals.push(body.title);
    }
    if (body.description !== undefined) {
      sets.push(`description = $${i++}`);
      vals.push(body.description);
    }
    if (body.priceMinor !== undefined) {
      sets.push(`price_minor = $${i++}`);
      vals.push(body.priceMinor);
    }
    if (body.stockQuantity !== undefined) {
      sets.push(`stock_quantity = $${i++}`);
      vals.push(body.stockQuantity);
    }
    if (body.isActive !== undefined) {
      sets.push(`is_active = $${i++}`);
      vals.push(body.isActive);
    }
    if (sets.length === 0 && body.imageUrl === undefined) {
      throw new BadRequestError("no fields to update");
    }
    sets.push(`updated_at = now()`);

    let updatedRow: InventoryProduct | null = null;
    if (sets.length > 0) {
      const sql = `UPDATE products SET ${sets.join(", ")} WHERE id = $1
        RETURNING id, seller_id, title, description, price_minor::text, currency,
                  stock_quantity, COALESCE(product_trust_score, 50)::text AS product_trust_score,
                  is_active`;
      const res = await c.query(sql, [productId, ...vals]);
      updatedRow = rowToProduct({ ...res.rows[0]!, image_url: null });
    }

    if (body.imageUrl !== undefined) {
      await c.query(
        `DELETE FROM product_media WHERE product_id = $1`,
        [productId],
      );
      if (body.imageUrl) {
        await c.query(
          `INSERT INTO product_media (product_id, url, alt_text, position)
           VALUES ($1, $2, '', 0)`,
          [productId, body.imageUrl],
        );
      }
    }

    if (!updatedRow) {
      // Only image changed; re-read the row.
      const r = await c.query(
        `SELECT id, seller_id, title, description, price_minor::text, currency,
                stock_quantity, COALESCE(product_trust_score, 50)::text AS product_trust_score,
                is_active
           FROM products WHERE id = $1`,
        [productId],
      );
      updatedRow = rowToProduct({ ...r.rows[0]!, image_url: body.imageUrl ?? null });
    }

    const media = await c.query<{ url: string }>(
      `SELECT url FROM product_media WHERE product_id = $1 ORDER BY position LIMIT 1`,
      [productId],
    );
    updatedRow.imageUrl = media.rows[0]?.url ?? updatedRow.imageUrl;

    await insertAuditLog(c, {
      actor_user_id: user.id,
      action: "product.update",
      resource_type: "product",
      resource_id: productId,
      payload: { fields: Object.keys(body) },
    });
    return updatedRow;
  });
}

export async function deleteProduct(
  user: AuthUser,
  idempotencyKey: string,
  productId: string,
): Promise<void> {
  if (user.role !== "seller") throw new ForbiddenError("sellers only");
  if (!idempotencyKey || idempotencyKey.length < 8) {
    throw new BadRequestError("Idempotency-Key header required (>=8 chars)");
  }
  await withTransaction({ userId: user.id, role: user.role }, async (c) => {
    const owner = await c.query<{ seller_id: string }>(
      `SELECT seller_id FROM products WHERE id = $1`,
      [productId],
    );
    if (owner.rowCount === 0) throw new NotFoundError("product not found");
    if (owner.rows[0]!.seller_id !== user.id) {
      throw new ForbiddenError("not your product");
    }
    // Soft-delete: flip is_active. Order items already referencing the
    // product stay valid for audit; new checkouts won't see it because
    // of `WHERE is_active = true` in checkout.service.ts.
    await c.query(`UPDATE products SET is_active = false, updated_at = now() WHERE id = $1`, [
      productId,
    ]);
    await insertAuditLog(c, {
      actor_user_id: user.id,
      action: "product.delete",
      resource_type: "product",
      resource_id: productId,
      payload: {},
    });
  });
}
