import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { requireAuth, getAuthUser } from "../../auth.js";
import { withTransaction } from "../../db.js";

const postMessageSchema = z.object({
  recipientUserId: z.string().uuid().nullable().optional(),
  content: z.string().min(1).max(2000),
  sessionId: z.string().min(1).max(100),
  role: z.enum(["buyer", "seller", "ai", "system"]).default("buyer"),
});

const listQuerySchema = z.object({
  sessionId: z.string().min(1).max(100),
  // Tolerate "?since=null" / "?since=" from clients that stringify nullables.
  since: z
    .preprocess(
      (v) => (v === "null" || v === "" ? undefined : v),
      z.string().datetime().optional(),
    ),
});

export async function registerChatRoute(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/v1/chat/messages",
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = getAuthUser(request);
      const q = listQuerySchema.parse(request.query);
      const rows = await withTransaction(
        { userId: user.id, role: user.role },
        async (c) => {
          const params: unknown[] = [user.id, q.sessionId];
          let sql = `SELECT id, sender_user_id, recipient_user_id, role, content, session_id, created_at
                       FROM chat_messages
                      WHERE session_id = $2
                        AND (sender_user_id = $1 OR recipient_user_id = $1)`;
          if (q.since) {
            sql += ` AND created_at > $3`;
            params.push(q.since);
          }
          sql += ` ORDER BY created_at ASC LIMIT 200`;
          return (await c.query(sql, params)).rows;
        },
      );
      reply.send(rows);
    },
  );

  app.post(
    "/api/v1/chat/messages",
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = getAuthUser(request);
      const body = postMessageSchema.parse(request.body);
      const row = await withTransaction(
        { userId: user.id, role: user.role },
        async (c) => {
          const inserted = await c.query<{
            id: string;
            sender_user_id: string;
            recipient_user_id: string | null;
            role: string;
            content: string;
            session_id: string;
            created_at: string;
          }>(
            `INSERT INTO chat_messages
               (sender_user_id, recipient_user_id, role, content, session_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, sender_user_id, recipient_user_id, role, content, session_id, created_at`,
            [user.id, body.recipientUserId ?? null, body.role, body.content, body.sessionId],
          );
          return inserted.rows[0]!;
        },
      );
      reply.status(201).send(row);
    },
  );



/**
 * GET /api/v1/chat/buyer — list of conversations where the caller is the buyer.
 *
 * Each row aggregates the most recent message per (buyerId, sellerId) pair
 * so the inbox renders cleanly. Unread count = messages from the seller
 * that haven't been read by the buyer (placeholder: 0 for now until the
 * read-tracking schema lands).
 */
app.get(
  "/api/v1/chat/buyer",
  { preHandler: requireAuth },
  async (request, reply) => {
    const user = getAuthUser(request);
    const rows = await withTransaction(
      { userId: user.id, role: user.role },
      async (c) => {
        const res = await c.query<{
          conversation_id: string;
          other_party_id: string;
          other_party_display_name: string;
          product_id: string | null;
          product_title: string | null;
          product_image_url: string | null;
          last_message_preview: string | null;
          last_message_at: string;
          unread_count: number;
        }>(
          `SELECT DISTINCT ON (cm.session_id)
                  cm.session_id AS conversation_id,
                  CASE WHEN cm.sender_user_id = $1 THEN cm.recipient_user_id ELSE cm.sender_user_id END AS other_party_id,
                  COALESCE(NULLIF(u.display_name, ''), u.username, u.phone, 'User') AS other_party_display_name,
                  NULL::uuid AS product_id,
                  NULL::text AS product_title,
                  NULL::text AS product_image_url,
                  SUBSTRING(cm.content, 1, 100) AS last_message_preview,
                  cm.created_at AS last_message_at,
                  0 AS unread_count
             FROM chat_messages cm
             JOIN users u ON u.id = CASE WHEN cm.sender_user_id = $1 THEN cm.recipient_user_id ELSE cm.sender_user_id END
            WHERE (cm.sender_user_id = $1 OR cm.recipient_user_id = $1)
              AND cm.role IN ('buyer', 'seller')
            ORDER BY cm.session_id, cm.created_at DESC`,
          [user.id],
        );
        return res.rows;
      },
    );
    reply.send(rows);
  },
);

/**
 * GET /api/v1/chat/seller — list of conversations where the caller is the seller.
 * Same shape as /buyer but scoped to seller-side.
 */
app.get(
  "/api/v1/chat/seller",
  { preHandler: requireAuth },
  async (request, reply) => {
    const user = getAuthUser(request);
    const rows = await withTransaction(
      { userId: user.id, role: user.role },
      async (c) => {
        const res = await c.query<{
          conversation_id: string;
          other_party_id: string;
          other_party_display_name: string;
          product_id: string | null;
          product_title: string | null;
          product_image_url: string | null;
          last_message_preview: string | null;
          last_message_at: string;
          unread_count: number;
        }>(
          `SELECT DISTINCT ON (cm.session_id)
                  cm.session_id AS conversation_id,
                  CASE WHEN cm.sender_user_id = $1 THEN cm.recipient_user_id ELSE cm.sender_user_id END AS other_party_id,
                  COALESCE(NULLIF(u.display_name, ''), u.username, u.phone, 'User') AS other_party_display_name,
                  NULL::uuid AS product_id,
                  NULL::text AS product_title,
                  NULL::text AS product_image_url,
                  SUBSTRING(cm.content, 1, 100) AS last_message_preview,
                  cm.created_at AS last_message_at,
                  0 AS unread_count
             FROM chat_messages cm
             JOIN users u ON u.id = CASE WHEN cm.sender_user_id = $1 THEN cm.recipient_user_id ELSE cm.sender_user_id END
            WHERE (cm.sender_user_id = $1 OR cm.recipient_user_id = $1)
              AND cm.role IN ('buyer', 'seller')
            ORDER BY cm.session_id, cm.created_at DESC`,
          [user.id],
        );
        return res.rows;
      },
    );
    reply.send(rows);
  },
);
}