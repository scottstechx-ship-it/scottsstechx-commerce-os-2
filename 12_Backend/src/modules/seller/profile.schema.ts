import { z } from "zod";

export const sellerProfilePatchSchema = z.object({
  businessName: z.string().min(1).max(120).optional(),
  businessDescription: z.string().max(2000).nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  bannerUrl: z.string().url().nullable().optional(),
  opensAt: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  closesAt: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
});
export type SellerProfilePatch = z.infer<typeof sellerProfilePatchSchema>;
