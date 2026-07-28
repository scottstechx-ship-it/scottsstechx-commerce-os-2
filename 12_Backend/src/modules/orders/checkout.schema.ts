/**
 * Zod schema for POST /api/v1/orders/checkout
 *
 * NOTE: No prices, no totals, no driver_id. All of those are server-derived.
 */

import { z } from "zod";

export const checkoutBodySchema = z.object({
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        qty: z.number().int().min(1).max(999),
      }),
    )
    .min(1)
    .max(50),
  delivery_address: z.object({
    line1: z.string().min(1).max(200),
    city: z.string().min(1).max(100),
    country: z.literal("UG"),
  }),
});

export type CheckoutBody = z.infer<typeof checkoutBodySchema>;

export const checkoutResponseSchema = z.object({
  order_id: z.string().uuid(),
  status: z.enum([
    "created",
    "paid",
    "assigned",
    "picked_up",
    "delivered",
    "cancelled",
    "refunded",
  ]),
  total_minor: z.number().int().nonnegative(),
  currency: z.string().length(3),
  fx_rate_snapshot: z.string(),
  items: z.array(
    z.object({
      product_id: z.string().uuid(),
      qty: z.number().int(),
      unit_price_minor: z.number().int().nonnegative(),
      line_total_minor: z.number().int().nonnegative(),
    }),
  ),
});

export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;
