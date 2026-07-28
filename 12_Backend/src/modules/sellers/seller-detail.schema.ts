import { z } from "zod";

export const sellerIdParamSchema = z.object({
  sellerId: z.string().uuid(),
});
