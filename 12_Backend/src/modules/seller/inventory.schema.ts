import { z } from "zod";

export const createProductBodySchema = z.object({
  title: z.string().min(1).max(80),
  description: z.string().min(1).max(500),
  priceMinor: z.number().int().nonnegative().max(9_999_999_999),
  currency: z.string().length(3).default("UGX"),
  stockQuantity: z.number().int().nonnegative().max(1_000_000),
  imageUrl: z.string().url().nullable().optional(),
});
export type CreateProductBody = z.infer<typeof createProductBodySchema>;

export const updateProductBodySchema = z.object({
  title: z.string().min(1).max(80).optional(),
  description: z.string().min(1).max(500).optional(),
  priceMinor: z.number().int().nonnegative().max(9_999_999_999).optional(),
  stockQuantity: z.number().int().nonnegative().max(1_000_000).optional(),
  imageUrl: z.string().url().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateProductBody = z.infer<typeof updateProductBodySchema>;

export const productIdParamSchema = z.object({
  productId: z.string().uuid(),
});
