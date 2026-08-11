/**
 * Settings V2 — per-user app settings (theme, language, notifications,
 * location, privacy). Stored in Postgres `user_settings` and mirrored
 * to Firestore so the mobile client can read offline.
 *
 *   GET  /api/v1/settings/v2
 *   PUT  /api/v1/settings/v2
 *
 * The schema is intentionally flat (key/value columns) so a single
 * row holds the whole settings doc.
 */
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { requireAuthAny, getAuthUser } from "../../firebase/auth-middleware.js";
import { getPool } from "../../db.js";
import { mirrorToUserDoc } from "../../firebase/mirror.js";

const settingsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  language: z.string().min(2).max(10).optional(),
  notificationsEnabled: z.boolean().optional(),
  notificationSound: z.boolean().optional(),
  locationSharing: z.enum(["off", "approximate", "precise"]).optional(),
  privacyShowReceipts: z.boolean().optional(),
  privacyShowTransactions: z.boolean().optional(),
  aiPersonalizationEnabled: z.boolean().optional(),
  preferredLanguage: z.string().min(2).max(10).optional(),
  preferredCurrency: z.string().min(2).max(8).optional(),
});

export async function registerSettingsV2Route(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/v1/settings/v2",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const pool = getPool();
      await ensureSettingsRow(pool, u.id);
      const r = await pool.query(
        `SELECT theme, language, notifications_enabled, notification_sound,
                location_sharing, privacy_show_receipts, privacy_show_transactions,
                ai_personalization_enabled, preferred_language, preferred_currency,
                updated_at
           FROM user_settings WHERE user_id = $1`,
        [u.id],
      );
      const row = r.rows[0] ?? {};
      reply.send({
        theme: row.theme ?? "system",
        language: row.language ?? "en",
        notificationsEnabled: row.notifications_enabled ?? true,
        notificationSound: row.notification_sound ?? true,
        locationSharing: row.location_sharing ?? "approximate",
        privacyShowReceipts: row.privacy_show_receipts ?? true,
        privacyShowTransactions: row.privacy_show_transactions ?? true,
        aiPersonalizationEnabled: row.ai_personalization_enabled ?? true,
        preferredLanguage: row.preferred_language ?? "en",
        preferredCurrency: row.preferred_currency ?? "UGX",
        updatedAt: row.updated_at,
      });
    },
  );

  app.put(
    "/api/v1/settings/v2",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const body = settingsSchema.parse(request.body);
      const pool = getPool();
      await ensureSettingsRow(pool, u.id);
      // Build a parameterized update
      const sets: string[] = [];
      const vals: unknown[] = [];
      let i = 1;
      const map: Record<string, string> = {
        theme: "theme",
        language: "language",
        notificationsEnabled: "notifications_enabled",
        notificationSound: "notification_sound",
        locationSharing: "location_sharing",
        privacyShowReceipts: "privacy_show_receipts",
        privacyShowTransactions: "privacy_show_transactions",
        aiPersonalizationEnabled: "ai_personalization_enabled",
        preferredLanguage: "preferred_language",
        preferredCurrency: "preferred_currency",
      };
      for (const [k, v] of Object.entries(body)) {
        if (v === undefined) continue;
        sets.push(`${map[k]} = $${i++}`);
        vals.push(v);
      }
      if (sets.length === 0) {
        reply.send({ ok: true, noChange: true });
        return;
      }
      sets.push(`updated_at = NOW()`);
      vals.push(u.id);
      await pool.query(
        `UPDATE user_settings SET ${sets.join(", ")} WHERE user_id = $${i}`,
        vals,
      );
      // Mirror to Firestore
      await mirrorToUserDoc(u.id, "settings", "main", {
        ...body,
        updatedAt: new Date().toISOString(),
      });
      reply.send({ ok: true });
    },
  );
}

async function ensureSettingsRow(pool: ReturnType<typeof getPool>, userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
}
