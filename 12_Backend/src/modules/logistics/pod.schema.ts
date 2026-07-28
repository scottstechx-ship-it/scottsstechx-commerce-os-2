/**
 * Zod schema for POST /api/v1/logistics/pod
 *
 * IMPORTANT: No driver_id. The driver is derived from the JWT.
 */

import { z } from "zod";

export const podBodySchema = z.object({
  order_id: z.string().uuid(),
  action: z.enum(["pickup", "deliver"]),
  gps_lat: z.number().min(-90).max(90),
  gps_lng: z.number().min(-180).max(180),
  notes: z.string().max(500).optional(),
});

export type PodBody = z.infer<typeof podBodySchema>;

export const podResponseSchema = z.object({
  order_id: z.string().uuid(),
  status: z.enum(["picked_up", "delivered"]),
});

export type PodResponse = z.infer<typeof podResponseSchema>;
