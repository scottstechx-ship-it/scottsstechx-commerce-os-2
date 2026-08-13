import { z } from "zod";

export const createProductBodySchema = z.object({
  title: z.string().min(1).max(80),
  description: z.string().min(1).max(500),
  priceMinor: z.number().int().nonnegative().max(9_999_999_999),
  currency: z.string().length(3).default("UGX"),
  stockQuantity: z.number().int().nonnegative().max(1_000_000),
  imageUrl: z.string().min(1).max(2048).nullable().optional(),  // single image URL (content:// for Android PhotoPicker)
  imageUrls: z.array(z.string().min(1).max(2048)).max(8).nullable().optional(),
  category: z.string().min(1).max(64).nullable().optional(),
  city: z.string().min(1).max(64).nullable().optional(),
});
export type CreateProductBody = z.infer<typeof createProductBodySchema>;

export const updateProductBodySchema = z.object({
  title: z.string().min(1).max(80).optional(),
  description: z.string().min(1).max(500).optional(),
  priceMinor: z.number().int().nonnegative().max(9_999_999_999).optional(),
  stockQuantity: z.number().int().nonnegative().max(1_000_000).optional(),
  imageUrl: z.string().min(1).max(2048).nullable().optional(),  // accept content:// URIs from Android PhotoPicker
  isActive: z.boolean().optional(),
});
export type UpdateProductBody = z.infer<typeof updateProductBodySchema>;

export const productIdParamSchema = z.object({
  productId: z.string().uuid(),
});


// =============================================================
// Full schema for v0.10.0 product create/update. Used by the
// web seller's product-edit form. Backed by the products table
// columns added in migration 0014.
// =============================================================
export const productFullCreateSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(0).max(4000),
  priceMinor: z.number().int().nonnegative().max(9_999_999_999),
  currency: z.string().length(3).default("UGX"),
  stockQuantity: z.number().int().nonnegative().max(1_000_000),
  imageUrl: z.string().min(1).max(2048).nullable().optional(),  // accept content:// URIs from Android PhotoPicker
  videoUrl: z.string().url().nullable().optional(),
  has360Image: z.boolean().optional(),
  sku: z.string().min(0).max(64).nullable().optional(),
  barcode: z.string().min(0).max(64).nullable().optional(),
  brand: z.string().min(0).max(80).nullable().optional(),
  category: z.string().min(0).max(64).nullable().optional(),
  subcategory: z.string().min(0).max(64).nullable().optional(),
  retailPriceMinor: z.number().int().nonnegative().optional(),
  wholesalePriceMinor: z.number().int().nonnegative().optional(),
  salePriceMinor: z.number().int().nonnegative().optional(),
  taxRateBps: z.number().int().nonnegative().max(10_000).optional(),
  weightGrams: z.number().int().nonnegative().max(1_000_000).optional(),
  lengthMm: z.number().int().nonnegative().max(100_000).optional(),
  widthMm: z.number().int().nonnegative().max(100_000).optional(),
  heightMm: z.number().int().nonnegative().max(100_000).optional(),
  shippingWeightGrams: z.number().int().nonnegative().max(1_000_000).optional(),
  seoTitle: z.string().min(0).max(200).nullable().optional(),
  seoDescription: z.string().min(0).max(1000).nullable().optional(),
  seoSlug: z.string().min(0).max(120).nullable().optional(),
  saleStartsAt: z.string().nullable().optional(),
  saleEndsAt: z.string().nullable().optional(),
});

export const productFullUpdateSchema = productFullCreateSchema.partial();

export const productFullIdParamSchema = z.object({
  productId: z.string().uuid(),
});
