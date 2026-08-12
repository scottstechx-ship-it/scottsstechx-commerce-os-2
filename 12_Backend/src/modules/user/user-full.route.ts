/**
 * Comprehensive user-settings + buyer-protection routes.
 *
 * Endpoints (all require auth):
 *   PROFILE
 *     GET    /api/v1/user/profile
 *     PATCH  /api/v1/user/profile
 *     POST   /api/v1/user/profile/avatar         (data URL, returns URL)
 *   ADDRESSES
 *     GET    /api/v1/user/addresses
 *     POST   /api/v1/user/addresses
 *     PATCH  /api/v1/user/addresses/:id
 *     DELETE /api/v1/user/addresses/:id
 *   PAYMENT METHODS
 *     GET    /api/v1/user/payment-methods
 *     POST   /api/v1/user/payment-methods
 *     PATCH  /api/v1/user/payment-methods/:id
 *     DELETE /api/v1/user/payment-methods/:id
 *   SAVED PRODUCTS
 *     GET    /api/v1/user/saved-products
 *     POST   /api/v1/user/saved-products/:productId
 *     DELETE /api/v1/user/saved-products/:productId
 *   SAVED SELLERS
 *     GET    /api/v1/user/saved-sellers
 *     POST   /api/v1/user/saved-sellers/:sellerId
 *     DELETE /api/v1/user/saved-sellers/:sellerId
 *   REFUNDS
 *     GET    /api/v1/user/refunds
 *     POST   /api/v1/user/refunds
 *   RETURNS
 *     GET    /api/v1/user/returns
 *     POST   /api/v1/user/returns
 *   SUPPORT / HELP
 *     GET    /api/v1/support/tickets
 *     POST   /api/v1/support/tickets
 *     POST   /api/v1/support/tickets/:id/reply
 *   CMS (public)
 *     GET    /api/v1/cms/:slug
 *   REPORTS
 *     POST   /api/v1/reports
 *   AUDIT
 *     GET    /api/v1/audit/me
 *   NOTIFICATIONS
 *     GET    /api/v1/notifications
 *     POST   /api/v1/notifications/mark-all-read
 *     POST   /api/v1/notifications/:id/read
 */
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { requireAuthAny, getAuthUser } from "../../firebase/auth-middleware.js";
import { withTransaction, getPool } from "../../db.js";
import { recordAudit } from "../../audit.js";

const profileUpdateSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  phone: z.string().max(40).optional().nullable(),
  bio: z.string().max(500).optional().nullable(),
  gender: z.enum(["female", "male", "other", "prefer_not_say"]).optional().nullable(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  language: z.string().max(8).optional(),
  currency: z.string().max(8).optional(),
});

const addressSchema = z.object({
  label: z.string().min(1).max(40).default("Home"),
  recipient: z.string().min(1).max(80),
  phone: z.string().max(40).optional().nullable(),
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional().nullable(),
  city: z.string().min(1).max(80),
  region: z.string().max(80).optional().nullable(),
  country: z.string().max(8).default("UG"),
  postalCode: z.string().max(20).optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  isDefault: z.boolean().optional().default(false),
});

const paymentSchema = z.object({
  kind: z.enum(["mobile_money", "card", "bank", "cash"]),
  provider: z.string().max(40).optional().nullable(),
  label: z.string().min(1).max(80),
  account: z.string().min(1).max(120),
  isDefault: z.boolean().optional().default(false),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

const refundSchema = z.object({
  transactionId: z.string().uuid().optional().nullable(),
  receiptNumber: z.string().max(80).optional().nullable(),
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().max(8).default("UGX"),
  reason: z.string().min(1).max(200),
  notes: z.string().max(2000).optional().nullable(),
  evidence: z.array(z.string().url()).optional().default([]),
});

const returnSchema = z.object({
  transactionId: z.string().uuid().optional().nullable(),
  productId: z.string().uuid().optional().nullable(),
  quantity: z.number().int().positive().default(1),
  reason: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
});

const ticketSchema = z.object({
  category: z.enum(["help", "contact", "report", "feedback"]),
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(4000),
  attachmentUrl: z.string().url().optional().nullable(),
});

const replySchema = z.object({
  message: z.string().min(1).max(4000),
});

const reportSchema = z.object({
  resourceType: z.enum(["product", "seller", "user", "message"]),
  resourceId: z.string().min(1),
  reason: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
});

export async function registerUserFullRoute(app: FastifyInstance): Promise<void> {
  // -----------------------------------------------------------------
  // PROFILE
  // -----------------------------------------------------------------
  app.get(
    "/api/v1/user/profile",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const r = await getPool().query(
        `SELECT id, email, display_name, phone, avatar_url, bio, gender,
                date_of_birth, language, currency,
                buyer_protection_opt_in, role, email_verified, created_at
           FROM users WHERE id = $1`,
        [u.id],
      );
      if (r.rows.length === 0) {
        reply.status(404).send({ error: "user_not_found" });
        return;
      }
      const row = r.rows[0]!;
      reply.send({
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        phone: row.phone,
        avatarUrl: row.avatar_url,
        bio: row.bio,
        gender: row.gender,
        dateOfBirth: row.date_of_birth,
        language: row.language,
        currency: row.currency,
        buyerProtectionOptIn: row.buyer_protection_opt_in,
        role: row.role,
        emailVerified: row.email_verified,
        createdAt: row.created_at,
      });
    },
  );

  app.patch(
    "/api/v1/user/profile",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const body = profileUpdateSchema.parse(request.body);
      const before = await getPool().query(
        `SELECT display_name, phone, bio, gender, date_of_birth, language, currency
           FROM users WHERE id = $1`,
        [u.id],
      );
      const updates: string[] = [];
      const params: unknown[] = [];
      if (body.displayName !== undefined) { updates.push(`display_name = $${params.length + 1}`); params.push(body.displayName); }
      if (body.phone !== undefined) { updates.push(`phone = $${params.length + 1}`); params.push(body.phone); }
      if (body.bio !== undefined) { updates.push(`bio = $${params.length + 1}`); params.push(body.bio); }
      if (body.gender !== undefined) { updates.push(`gender = $${params.length + 1}`); params.push(body.gender); }
      if (body.dateOfBirth !== undefined) { updates.push(`date_of_birth = $${params.length + 1}`); params.push(body.dateOfBirth); }
      if (body.language !== undefined) { updates.push(`language = $${params.length + 1}`); params.push(body.language); }
      if (body.currency !== undefined) { updates.push(`currency = $${params.length + 1}`); params.push(body.currency); }
      if (updates.length === 0) {
        reply.send({ ok: true, changed: 0 });
        return;
      }
      updates.push(`updated_at = $${params.length + 1}`); params.push(new Date().toISOString());
      params.push(u.id);
      await withTransaction({ userId: u.id, role: u.role }, async (c) => {
        await c.query(`UPDATE users SET ${updates.join(", ")} WHERE id = $${params.length}`, params);
      });
      await recordAudit({
        userId: u.id,
        action: "user.profile.update",
        resource: `user:${u.id}`,
        before: before.rows[0] ?? {},
        after: body,
      });
      reply.send({ ok: true, changed: updates.length });
    },
  );

  app.post(
    "/api/v1/user/profile/avatar",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const body = request.body as { avatarUrl?: string };
      const url = body.avatarUrl?.trim();
      if (!url || url.length > 2000) {
        reply.status(400).send({ error: "avatar_url_required" });
        return;
      }
      await withTransaction({ userId: u.id, role: u.role }, async (c) => {
        await c.query(
          `UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2`,
          [url, u.id],
        );
      });
      await recordAudit({
        userId: u.id, action: "user.profile.avatar", resource: `user:${u.id}`,
        after: { avatarUrl: url },
      });
      reply.send({ ok: true, avatarUrl: url });
    },
  );

  // -----------------------------------------------------------------
  // ADDRESSES
  // -----------------------------------------------------------------
  app.get(
    "/api/v1/user/addresses",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const r = await getPool().query(
        `SELECT id, label, recipient, phone, line1, line2, city, region, country,
                postal_code, latitude, longitude, is_default, created_at
           FROM user_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
        [u.id],
      );
      reply.send(r.rows.map((a) => ({
        id: a.id,
        label: a.label,
        recipient: a.recipient,
        phone: a.phone,
        line1: a.line1,
        line2: a.line2,
        city: a.city,
        region: a.region,
        country: a.country,
        postalCode: a.postal_code,
        latitude: a.latitude,
        longitude: a.longitude,
        isDefault: a.is_default,
        createdAt: a.created_at,
      })));
    },
  );

  app.post(
    "/api/v1/user/addresses",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const body = addressSchema.parse(request.body);
      const newAddr = await withTransaction(
        { userId: u.id, role: u.role },
        async (c) => {
          if (body.isDefault) {
            await c.query(`UPDATE user_addresses SET is_default = false WHERE user_id = $1`, [u.id]);
          }
          const ins = await c.query<{ id: string }>(
            `INSERT INTO user_addresses
               (user_id, label, recipient, phone, line1, line2, city, region, country,
                postal_code, latitude, longitude, is_default)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING id`,
            [u.id, body.label, body.recipient, body.phone ?? null, body.line1, body.line2 ?? null,
             body.city, body.region ?? null, body.country, body.postalCode ?? null,
             body.latitude ?? null, body.longitude ?? null, body.isDefault ?? false],
          );
          return ins.rows[0]!;
        },
      );
      await recordAudit({
        userId: u.id, action: "user.address.add", resource: `address:${newAddr.id}`,
        after: body,
      });
      reply.send({ ok: true, id: newAddr.id });
    },
  );

  app.patch(
    "/api/v1/user/addresses/:id",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const params = request.params as { id: string };
      const body = addressSchema.partial().parse(request.body);
      const updates: string[] = [];
      const q: unknown[] = [];
      const map: Record<string, unknown> = {
        label: body.label, recipient: body.recipient, phone: body.phone,
        line1: body.line1, line2: body.line2, city: body.city,
        region: body.region, country: body.country,
        postal_code: body.postalCode, latitude: body.latitude,
        longitude: body.longitude, is_default: body.isDefault,
      };
      for (const [k, v] of Object.entries(map)) {
        if (v !== undefined) { updates.push(`${k} = $${q.length + 1}`); q.push(v); }
      }
      if (updates.length === 0) { reply.send({ ok: true, changed: 0 }); return; }
      if (body.isDefault) {
        await withTransaction({ userId: u.id, role: u.role }, async (c) => {
          await c.query(
            `UPDATE user_addresses SET is_default = false WHERE user_id = $1 AND id <> $2`,
            [u.id, params.id],
          );
        });
      }
      updates.push(`updated_at = $${q.length + 1}`); q.push(new Date().toISOString());
      q.push(params.id); q.push(u.id);
      await withTransaction({ userId: u.id, role: u.role }, async (c) => {
        const r = await c.query(
          `UPDATE user_addresses SET ${updates.join(", ")} WHERE id = $${q.length - 1} AND user_id = $${q.length}`,
          q,
        );
        if (r.rowCount === 0) {
          reply.status(404).send({ error: "address_not_found" });
          return;
        }
      });
      reply.send({ ok: true });
    },
  );

  app.delete(
    "/api/v1/user/addresses/:id",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const params = request.params as { id: string };
      const r = await withTransaction(
        { userId: u.id, role: u.role },
        async (c) => c.query(
          `DELETE FROM user_addresses WHERE id = $1 AND user_id = $2`,
          [params.id, u.id],
        ),
      );
      if (r.rowCount === 0) {
        reply.status(404).send({ error: "address_not_found" });
        return;
      }
      reply.send({ ok: true });
    },
  );

  // -----------------------------------------------------------------
  // PAYMENT METHODS
  // -----------------------------------------------------------------
  app.get(
    "/api/v1/user/payment-methods",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const r = await getPool().query(
        `SELECT id, kind, provider, label, account, is_default, expires_at, metadata, created_at
           FROM user_payment_methods WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
        [u.id],
      );
      reply.send(r.rows.map((p) => ({
        id: p.id,
        kind: p.kind,
        provider: p.provider,
        label: p.label,
        account: p.account,
        isDefault: p.is_default,
        expiresAt: p.expires_at,
        metadata: p.metadata,
        createdAt: p.created_at,
      })));
    },
  );

  app.post(
    "/api/v1/user/payment-methods",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const body = paymentSchema.parse(request.body);
      const newPm = await withTransaction(
        { userId: u.id, role: u.role },
        async (c) => {
          if (body.isDefault) {
            await c.query(`UPDATE user_payment_methods SET is_default = false WHERE user_id = $1`, [u.id]);
          }
          const ins = await c.query<{ id: string }>(
            `INSERT INTO user_payment_methods
               (user_id, kind, provider, label, account, is_default, expires_at, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id`,
            [u.id, body.kind, body.provider ?? null, body.label, body.account,
             body.isDefault ?? false, body.expiresAt ?? null, body.metadata ?? {}],
          );
          return ins.rows[0]!;
        },
      );
      reply.send({ ok: true, id: newPm.id });
    },
  );

  app.patch(
    "/api/v1/user/payment-methods/:id",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const params = request.params as { id: string };
      const body = paymentSchema.partial().parse(request.body);
      const updates: string[] = [];
      const q: unknown[] = [];
      const map: Record<string, unknown> = {
        kind: body.kind, provider: body.provider, label: body.label,
        account: body.account, is_default: body.isDefault,
        expires_at: body.expiresAt, metadata: body.metadata,
      };
      for (const [k, v] of Object.entries(map)) {
        if (v !== undefined) { updates.push(`${k} = $${q.length + 1}`); q.push(v); }
      }
      if (updates.length === 0) { reply.send({ ok: true, changed: 0 }); return; }
      if (body.isDefault) {
        await withTransaction({ userId: u.id, role: u.role }, async (c) => {
          await c.query(
            `UPDATE user_payment_methods SET is_default = false WHERE user_id = $1 AND id <> $2`,
            [u.id, params.id],
          );
        });
      }
      updates.push(`updated_at = $${q.length + 1}`); q.push(new Date().toISOString());
      q.push(params.id); q.push(u.id);
      await withTransaction({ userId: u.id, role: u.role }, async (c) => {
        await c.query(
          `UPDATE user_payment_methods SET ${updates.join(", ")} WHERE id = $${q.length - 1} AND user_id = $${q.length}`,
          q,
        );
      });
      reply.send({ ok: true });
    },
  );

  app.delete(
    "/api/v1/user/payment-methods/:id",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const params = request.params as { id: string };
      const r = await withTransaction(
        { userId: u.id, role: u.role },
        async (c) => c.query(
          `DELETE FROM user_payment_methods WHERE id = $1 AND user_id = $2`,
          [params.id, u.id],
        ),
      );
      if (r.rowCount === 0) {
        reply.status(404).send({ error: "payment_method_not_found" });
        return;
      }
      reply.send({ ok: true });
    },
  );

  // -----------------------------------------------------------------
  // SAVED PRODUCTS
  // -----------------------------------------------------------------
  app.get(
    "/api/v1/user/saved-products",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const r = await getPool().query(
        `SELECT sp.product_id, sp.saved_at,
                p.title, p.price_minor, p.currency, p.image_url, p.image_url_signed,
                p.stock_quantity, p.rating,
                s.business_name AS seller_name, s.market_name AS store_name
           FROM saved_products sp
           JOIN products p ON p.id = sp.product_id
           LEFT JOIN seller_profiles s ON s.user_id = p.seller_id
          WHERE sp.user_id = $1
          ORDER BY sp.saved_at DESC`,
        [u.id],
      );
      reply.send(r.rows.map((r) => ({
        productId: r.product_id,
        savedAt: r.saved_at,
        title: r.title,
        priceMinor: r.price_minor ? Number(r.price_minor) : null,
        currency: r.currency,
        imageUrl: r.image_url_signed || r.image_url,
        stock: r.stock_quantity,
        rating: r.rating ? Number(r.rating) : null,
        sellerName: r.seller_name,
        storeName: r.store_name,
      })));
    },
  );

  app.post(
    "/api/v1/user/saved-products/:productId",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const params = request.params as { productId: string };
      await withTransaction(
        { userId: u.id, role: u.role },
        async (c) => {
          await c.query(
            `INSERT INTO saved_products (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [u.id, params.productId],
          );
        },
      );
      reply.send({ ok: true, saved: true });
    },
  );

  app.delete(
    "/api/v1/user/saved-products/:productId",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const params = request.params as { productId: string };
      await withTransaction(
        { userId: u.id, role: u.role },
        async (c) => c.query(
          `DELETE FROM saved_products WHERE user_id = $1 AND product_id = $2`,
          [u.id, params.productId],
        ),
      );
      reply.send({ ok: true, saved: false });
    },
  );

  // -----------------------------------------------------------------
  // SAVED SELLERS
  // -----------------------------------------------------------------
  app.get(
    "/api/v1/user/saved-sellers",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const r = await getPool().query(
        `SELECT ss.seller_id, ss.saved_at, ss.notify,
                s.business_name, s.market_name, s.seller_trust_score,
                u.display_name, u.avatar_url,
                (SELECT COUNT(*) FROM follows f WHERE f.follower_id = $1 AND f.seller_id = ss.seller_id) AS is_following
           FROM saved_sellers ss
           JOIN seller_profiles s ON s.user_id = ss.seller_id
           JOIN users u ON u.id = s.user_id
          WHERE ss.user_id = $1
          ORDER BY ss.saved_at DESC`,
        [u.id],
      );
      reply.send(r.rows.map((r) => ({
        sellerId: r.seller_id,
        savedAt: r.saved_at,
        notify: r.notify,
        businessName: r.business_name,
        marketName: r.market_name,
        trustScore: r.seller_trust_score ? Number(r.seller_trust_score) : null,
        displayName: r.display_name,
        avatarUrl: r.avatar_url,
        isFollowing: Number(r.is_following) > 0,
      })));
    },
  );

  app.post(
    "/api/v1/user/saved-sellers/:sellerId",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const params = request.params as { sellerId: string };
      await withTransaction(
        { userId: u.id, role: u.role },
        async (c) => {
          await c.query(
            `INSERT INTO saved_sellers (user_id, seller_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [u.id, params.sellerId],
          );
        },
      );
      reply.send({ ok: true, saved: true });
    },
  );

  app.delete(
    "/api/v1/user/saved-sellers/:sellerId",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const params = request.params as { sellerId: string };
      await withTransaction(
        { userId: u.id, role: u.role },
        async (c) => c.query(
          `DELETE FROM saved_sellers WHERE user_id = $1 AND seller_id = $2`,
          [u.id, params.sellerId],
        ),
      );
      reply.send({ ok: true, saved: false });
    },
  );

  // -----------------------------------------------------------------
  // REFUNDS
  // -----------------------------------------------------------------
  app.get(
    "/api/v1/user/refunds",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const r = await getPool().query(
        `SELECT id, transaction_id, receipt_number, amount_minor, currency,
                reason, status, notes, created_at, updated_at, resolved_at
           FROM refunds WHERE user_id = $1 ORDER BY created_at DESC`,
        [u.id],
      );
      reply.send(r.rows.map((r) => ({
        id: r.id,
        transactionId: r.transaction_id,
        receiptNumber: r.receipt_number,
        amountMinor: r.amount_minor ? Number(r.amount_minor) : null,
        currency: r.currency,
        reason: r.reason,
        status: r.status,
        notes: r.notes,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        resolvedAt: r.resolved_at,
      })));
    },
  );

  app.post(
    "/api/v1/user/refunds",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const body = refundSchema.parse(request.body);
      const newRefund = await withTransaction(
        { userId: u.id, role: u.role },
        async (c) => {
          const ins = await c.query<{ id: string }>(
            `INSERT INTO refunds
               (user_id, transaction_id, receipt_number, amount_minor, currency,
                reason, status, notes, evidence)
             VALUES ($1, $2, $3, $4, $5, $6, 'requested', $7, $8)
             RETURNING id`,
            [u.id, body.transactionId ?? null, body.receiptNumber ?? null,
             body.amountMinor, body.currency, body.reason, body.notes ?? null,
             JSON.stringify(body.evidence ?? [])],
          );
          return ins.rows[0]!;
        },
      );
      await recordAudit({
        userId: u.id, action: "refund.create", resource: `refund:${newRefund.id}`,
        after: body,
      });
      reply.send({ ok: true, id: newRefund.id });
    },
  );

  // -----------------------------------------------------------------
  // RETURNS
  // -----------------------------------------------------------------
  app.get(
    "/api/v1/user/returns",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const r = await getPool().query(
        `SELECT id, transaction_id, product_id, quantity, reason, description,
                status, refund_id, tracking_number, created_at, updated_at
           FROM product_returns WHERE user_id = $1 ORDER BY created_at DESC`,
        [u.id],
      );
      reply.send(r.rows.map((r) => ({
        id: r.id,
        transactionId: r.transaction_id,
        productId: r.product_id,
        quantity: r.quantity,
        reason: r.reason,
        description: r.description,
        status: r.status,
        refundId: r.refund_id,
        trackingNumber: r.tracking_number,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })));
    },
  );

  app.post(
    "/api/v1/user/returns",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const body = returnSchema.parse(request.body);
      const newReturn = await withTransaction(
        { userId: u.id, role: u.role },
        async (c) => {
          const ins = await c.query<{ id: string }>(
            `INSERT INTO product_returns
               (user_id, transaction_id, product_id, quantity, reason, description, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'requested')
             RETURNING id`,
            [u.id, body.transactionId ?? null, body.productId ?? null,
             body.quantity, body.reason, body.description ?? null],
          );
          return ins.rows[0]!;
        },
      );
      reply.send({ ok: true, id: newReturn.id });
    },
  );

  // -----------------------------------------------------------------
  // SUPPORT TICKETS
  // -----------------------------------------------------------------
  app.get(
    "/api/v1/support/tickets",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const r = await getPool().query(
        `SELECT id, category, subject, message, attachment_url, status,
                created_at, updated_at
           FROM support_tickets WHERE user_id = $1 ORDER BY created_at DESC`,
        [u.id],
      );
      reply.send(r.rows.map((r) => ({
        id: r.id,
        category: r.category,
        subject: r.subject,
        message: r.message,
        attachmentUrl: r.attachment_url,
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })));
    },
  );

  app.post(
    "/api/v1/support/tickets",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const body = ticketSchema.parse(request.body);
      const newTicket = await withTransaction(
        { userId: u.id, role: u.role },
        async (c) => {
          const ins = await c.query<{ id: string }>(
            `INSERT INTO support_tickets
               (user_id, category, subject, message, attachment_url, status)
             VALUES ($1, $2, $3, $4, $5, 'open')
             RETURNING id`,
            [u.id, body.category, body.subject, body.message, body.attachmentUrl ?? null],
          );
          return ins.rows[0]!;
        },
      );
      reply.send({ ok: true, id: newTicket.id });
    },
  );

  app.post(
    "/api/v1/support/tickets/:id/reply",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const params = request.params as { id: string };
      const body = replySchema.parse(request.body);
      const r = await withTransaction(
        { userId: u.id, role: u.role },
        async (c) => c.query(
          `UPDATE support_tickets SET message = message || E'\\n\\n---\\nUser reply: ' || $1,
                updated_at = NOW()
            WHERE id = $2 AND user_id = $3`,
          [body.message, params.id, u.id],
        ),
      );
      if (r.rowCount === 0) {
        reply.status(404).send({ error: "ticket_not_found" });
        return;
      }
      reply.send({ ok: true });
    },
  );

  // -----------------------------------------------------------------
  // CMS (public read; no auth required for terms/privacy/about)
  // -----------------------------------------------------------------
  app.get("/api/v1/cms/:slug", async (request, reply) => {
    const params = request.params as { slug: string };
    const q = request.query as { locale?: string };
    const locale = q.locale ?? "en";
    const r = await getPool().query(
      `SELECT slug, title, body, version, locale, updated_at
         FROM cms_content WHERE slug = $1 AND locale = $2 AND published = true
         ORDER BY updated_at DESC LIMIT 1`,
      [params.slug, locale],
    );
    if (r.rows.length === 0) {
      reply.status(404).send({ error: "content_not_found" });
      return;
    }
    reply.send({
      slug: r.rows[0].slug,
      title: r.rows[0].title,
      body: r.rows[0].body,
      version: r.rows[0].version,
      locale: r.rows[0].locale,
      updatedAt: r.rows[0].updated_at,
    });
  });

  // -----------------------------------------------------------------
  // REPORTS
  // -----------------------------------------------------------------
  app.post(
    "/api/v1/reports",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const body = reportSchema.parse(request.body);
      const newReport = await getPool().query<{ id: string }>(
        `INSERT INTO support_tickets
           (user_id, category, subject, message, status)
         VALUES ($1, 'report', $2, $3, 'open')
         RETURNING id`,
        [u.id, `Report ${body.resourceType}:${body.resourceId}`, body.description ?? body.reason],
      );
      reply.send({ ok: true, id: newReport.rows[0]!.id });
    },
  );

  // -----------------------------------------------------------------
  // AUDIT LOG (own actions)
  // -----------------------------------------------------------------
  app.get(
    "/api/v1/audit/me",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const r = await getPool().query(
        `SELECT id, action, resource, before, after, created_at
           FROM audit_log WHERE user_id = $1
          ORDER BY created_at DESC LIMIT 100`,
        [u.id],
      );
      reply.send(r.rows.map((r) => ({
        id: r.id,
        action: r.action,
        resource: r.resource,
        before: r.before,
        after: r.after,
        createdAt: r.created_at,
      })));
    },
  );

  // -----------------------------------------------------------------
  // NOTIFICATIONS
  // -----------------------------------------------------------------
  app.get(
    "/api/v1/notifications",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const r = await getPool().query(
        `SELECT id, kind, title, body, action_url, deep_link, icon,
                read, read_at, created_at
           FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [u.id],
      );
      reply.send(r.rows.map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        actionUrl: n.action_url,
        deepLink: n.deep_link,
        icon: n.icon,
        read: n.read,
        readAt: n.read_at,
        createdAt: n.created_at,
      })));
    },
  );

  app.post(
    "/api/v1/notifications/mark-all-read",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      await getPool().query(
        `UPDATE notifications SET read = true, read_at = NOW()
          WHERE user_id = $1 AND read = false`,
        [u.id],
      );
      reply.send({ ok: true });
    },
  );

  app.post(
    "/api/v1/notifications/:id/read",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const params = request.params as { id: string };
      await getPool().query(
        `UPDATE notifications SET read = true, read_at = NOW()
          WHERE id = $1 AND user_id = $2`,
        [params.id, u.id],
      );
      reply.send({ ok: true });
    },
  );
}
