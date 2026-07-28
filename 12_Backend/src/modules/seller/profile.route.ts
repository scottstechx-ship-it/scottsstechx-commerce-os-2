import type { FastifyInstance } from "fastify";
import { requireAuth, getAuthUser } from "../../auth.js";
import { withTransaction } from "../../db.js";
import { ForbiddenError, NotFoundError } from "../../errors.js";
import { insertAuditLog } from "../audit/audit.js";
import { sellerProfilePatchSchema } from "./profile.schema.js";

async function getOrCreateOwnProfile(user: import("../../auth.js").AuthUser): Promise<Record<string, unknown>> {
  return withTransaction({ userId: user.id, role: user.role }, async (c) => {
    if (user.role !== "seller") throw new ForbiddenError("sellers only");
    const r = await c.query(
      `SELECT user_id, business_name, business_description, address, lat, lng,
              avatar_url, banner_url, opens_at, closes_at, is_verified,
              seller_trust_score, rating_avg, total_reviews
         FROM seller_profiles WHERE user_id = $1`,
      [user.id],
    );
    if (r.rowCount && r.rowCount > 0) return r.rows[0]!;
    const u = await c.query<{ display_name: string }>(
      `SELECT display_name FROM users WHERE id = $1`,
      [user.id],
    );
    const displayName = u.rows[0]?.display_name ?? "New Seller";
    const inserted = await c.query(
      `INSERT INTO seller_profiles (user_id, business_name) VALUES ($1, $2) RETURNING *`,
      [user.id, `${displayName}'s Shop`],
    );
    return inserted.rows[0]!;
  });
}

export async function registerProfileRoute(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/v1/seller/profile",
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = getAuthUser(request);
      const row = await getOrCreateOwnProfile(user);
      reply.send(row);
    },
  );

  app.patch(
    "/api/v1/seller/profile",
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = getAuthUser(request);
      const body = sellerProfilePatchSchema.parse(request.body);
      const updated = await withTransaction(
        { userId: user.id, role: user.role },
        async (c) => {
          const sets: string[] = [];
          const vals: unknown[] = [];
          let i = 2;
          const map: Record<string, string> = {
            businessName: "business_name",
            businessDescription: "business_description",
            address: "address",
            lat: "lat",
            lng: "lng",
            avatarUrl: "avatar_url",
            bannerUrl: "banner_url",
            opensAt: "opens_at",
            closesAt: "closes_at",
          };
          for (const [k, col] of Object.entries(map)) {
            const v = (body as Record<string, unknown>)[k];
            if (v !== undefined) {
              sets.push(`${col} = $${i++}`);
              vals.push(v);
            }
          }
          if (sets.length === 0) {
            throw new NotFoundError("no fields to update");
          }
          sets.push(`updated_at = now()`);
          const sql = `UPDATE seller_profiles SET ${sets.join(", ")}
                         WHERE user_id = $1 RETURNING *`;
          const r = await c.query(sql, [user.id, ...vals]);
          await insertAuditLog(c, {
            actor_user_id: user.id,
            action: "seller.profile.update",
            resource_type: "seller_profile",
            resource_id: user.id,
            payload: { fields: Object.keys(body) },
          });
          return r.rows[0]!;
        },
      );
      reply.send(updated);
    },
  );
}
