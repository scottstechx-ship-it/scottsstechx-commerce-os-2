import { z } from "zod";

export const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(0.1).max(200).default(25),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type NearbyQuery = z.infer<typeof nearbyQuerySchema>;
