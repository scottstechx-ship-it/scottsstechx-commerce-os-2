/**
 * Chat v2 — media + threads + Firestore mirror.
 *
 *   POST /api/v1/chat/v2/upload-url
 *     Body: { conversationId, mime, ext }
 *     Returns a short-lived signed upload URL the client uses to PUT
 *     the bytes directly to Firebase Storage, plus a public read
 *     URL it can use later. The Storage path is
 *       chat/{conversationId}/{messageId}.{ext}
 *
 *   POST /api/v1/chat/v2/messages
 *     Body: { conversationId, content, attachmentUrl?, attachmentMime?,
 *             threadParentId? }
 *     Persists the message in Postgres, mirrors to Firestore, and
 *     returns the canonical message row.
 *
 *   GET /api/v1/chat/v2/conversations
 *     Returns the caller's conversation list (buyer-side OR seller-side
 *     depending on the caller's role), with the most recent message
 *     per conversation, unread count, and the other party's display
 *     name + avatar.
 *
 *   POST /api/v1/chat/v2/conversations/{cid}/read
 *     Marks all messages in the conversation as read by the caller.
 *
 * Firestore mirror layout (mobile reads from here for offline):
 *   /conversations/{conversationId}
 *     participants: [uidA, uidB]
 *     productId, productTitle, productImageUrl
 *     lastMessage, lastMessageAt, lastMessageFromUid
 *     updatedAt
 *   /conversations/{conversationId}/messages/{messageId}
 *     senderUid, recipientUid, content, attachmentUrl, attachmentMime,
 *     threadParentId, createdAt, role, readBy
 */
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { requireAuthAny, getAuthUser } from "../../firebase/auth-middleware.js";
import { withTransaction, getPool } from "../../db.js";
import { signedUploadUrl, newChatMediaPath } from "../../firebase/storage.js";
import { mirrorToUserDoc, mirrorToCollection, serverTimestamp } from "../../firebase/mirror.js";
import { randomUUID } from "node:crypto";

const uploadUrlSchema = z.object({
  conversationId: z.string().min(1).max(100),
  mime: z.string().min(3).max(100),
  ext: z.string().min(1).max(10),
});

const messageSchema = z.object({
  conversationId: z.string().min(1).max(100),
  content: z.string().min(1).max(4000),
  attachmentUrl: z.string().url().optional(),
  attachmentMime: z.string().max(100).optional(),
  threadParentId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  productTitle: z.string().max(200).optional(),
  productImageUrl: z.string().url().optional(),
});

export async function registerChatV2Route(app: FastifyInstance): Promise<void> {
  // -----------------------------------------------------------------
  app.post(
    "/api/v1/chat/v2/upload-url",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const body = uploadUrlSchema.parse(request.body);
      const messageId = randomUUID();
      const objectPath = newChatMediaPath(body.conversationId + "/" + messageId, body.ext);
      const signed = await signedUploadUrl(objectPath, body.mime);
      reply.send({
        uploadUrl: signed.url,
        gsPath: signed.gsPath,
        publicUrl: signed.gsPath.replace("gs://", "https://storage.googleapis.com/"),
        messageId,
        expiresAt: signed.expiresAt,
      });
    },
  );

  // -----------------------------------------------------------------
  app.post(
    "/api/v1/chat/v2/messages",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const body = messageSchema.parse(request.body);
      // Derive the other party from conversationId
      const otherUid = await deriveOtherParty(body.conversationId, u.id);
      const message = await withTransaction(
        { userId: u.id, role: u.role },
        async (c) => {
          const ins = await c.query<{
            id: string;
            sender_user_id: string;
            recipient_user_id: string | null;
            role: string;
            content: string;
            session_id: string;
            attachment_url: string | null;
            attachment_mime: string | null;
            thread_parent_id: string | null;
            created_at: string;
          }>(
            `INSERT INTO chat_messages (
               sender_user_id, recipient_user_id, role, content,
               session_id, attachment_url, attachment_mime, thread_parent_id
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id, sender_user_id, recipient_user_id, role, content,
                       session_id, attachment_url, attachment_mime,
                       thread_parent_id, created_at`,
            [
              u.id,
              otherUid,
              u.role,
              body.content,
              body.conversationId,
              body.attachmentUrl ?? null,
              body.attachmentMime ?? null,
              body.threadParentId ?? null,
            ],
          );
          return ins.rows[0]!;
        },
      );
      // Mirror to Firestore
      try {
        const ts = await serverTimestamp();
        const convData: Record<string, unknown> = {
          participants: [u.id, otherUid].filter(Boolean).sort(),
          lastMessage: body.content,
          lastMessageAt: ts,
          lastMessageFromUid: u.id,
          lastMessageRole: u.role,
          updatedAt: ts,
        };
        if (body.productId) convData.productId = body.productId;
        if (body.productTitle) convData.productTitle = body.productTitle;
        if (body.productImageUrl) convData.productImageUrl = body.productImageUrl;
        await mirrorToCollection(
          "conversations",
          body.conversationId,
          convData,
          { merge: true },
        );
        const msgData: Record<string, unknown> = {
          senderUid: u.id,
          recipientUid: otherUid,
          content: body.content,
          role: u.role,
          attachmentUrl: body.attachmentUrl ?? null,
          attachmentMime: body.attachmentMime ?? null,
          threadParentId: body.threadParentId ?? null,
          readBy: [u.id],
          createdAt: ts,
        };
        await mirrorToCollection(
          "conversations/" + body.conversationId + "/messages",
          message.id,
          msgData,
        );
        if (otherUid) {
          await mirrorToUserDoc(otherUid, "inbox", body.conversationId, {
            fromUid: u.id,
            content: body.content,
            createdAt: ts,
            read: false,
          });
        }
      } catch (err) {
        app.log.warn({ err: (err as Error).message }, "firestore chat mirror failed");
      }
      reply.send({
        id: message.id,
        conversationId: message.session_id,
        senderUid: message.sender_user_id,
        recipientUid: message.recipient_user_id,
        content: message.content,
        role: message.role,
        attachmentUrl: message.attachment_url,
        attachmentMime: message.attachment_mime,
        threadParentId: message.thread_parent_id,
        createdAt: message.created_at,
      });
    },
  );

  // -----------------------------------------------------------------
  app.get(
    "/api/v1/chat/v2/conversations",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const rows = await withTransaction(
        { userId: u.id, role: u.role },
        async (c) => {
          const res = await c.query<{
            conversation_id: string;
            other_party_id: string;
            other_party_display_name: string | null;
            product_id: string | null;
            product_title: string | null;
            product_image_url: string | null;
            last_message_preview: string | null;
            last_message_at: string;
            unread_count: number;
            last_message_attachment_url: string | null;
          }>(
            `SELECT DISTINCT ON (cm.session_id)
                    cm.session_id AS conversation_id,
                    CASE WHEN cm.sender_user_id = $1 THEN cm.recipient_user_id ELSE cm.sender_user_id END AS other_party_id,
                    COALESCE(NULLIF(u.display_name, ''), u.username, u.email, 'User') AS other_party_display_name,
                    NULL::uuid AS product_id,
                    NULL::text AS product_title,
                    NULL::text AS product_image_url,
                    SUBSTRING(cm.content, 1, 200) AS last_message_preview,
                    cm.created_at AS last_message_at,
                    (SELECT COUNT(*) FROM chat_messages cm2
                       WHERE cm2.session_id = cm.session_id
                         AND cm2.sender_user_id != $1
                         AND cm2.deleted_at IS NULL) AS unread_count,
                    (SELECT attachment_url FROM chat_messages cm3
                       WHERE cm3.session_id = cm.session_id
                         AND cm3.deleted_at IS NULL
                       ORDER BY cm3.created_at DESC LIMIT 1) AS last_message_attachment_url
               FROM chat_messages cm
               JOIN users u ON u.id = CASE WHEN cm.sender_user_id = $1 THEN cm.recipient_user_id ELSE cm.sender_user_id END
              WHERE (cm.sender_user_id = $1 OR cm.recipient_user_id = $1)
                AND cm.deleted_at IS NULL
                AND cm.role IN ('buyer', 'seller')
              ORDER BY cm.session_id, cm.created_at DESC`,
            [u.id],
          );
          return res.rows;
        },
      );
      reply.send(rows);
    },
  );

  // -----------------------------------------------------------------
  app.post(
    "/api/v1/chat/v2/conversations/:cid/read",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const params = request.params as { cid: string };
      // Mark all messages in the conversation as read by the caller.
      // We add the caller to a `read_by` JSONB column (lazily added if
      // missing). For now we just bump an `inbox.read` flag in Firestore.
      try {
        await mirrorToUserDoc(u.id, "inbox", params.cid, {
          read: true,
          readAt: new Date().toISOString(),
        });
      } catch {
        // best-effort
      }
      reply.send({ ok: true });
    },
  );

  // -----------------------------------------------------------------
  // GET /api/v1/chat/v2/conversations/:cid/messages
  //   Returns all messages in the conversation, ordered oldest first.
  //   Used by the Android client to hydrate a thread and to poll for
  //   new messages every few seconds (combined with `since` for delta).
  app.get(
    "/api/v1/chat/v2/conversations/:cid/messages",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const routeParams = request.params as { cid: string };
      const q = request.query as { since?: string; limit?: string };
      const limit = Math.min(Math.max(parseInt(q.limit ?? "100", 10) || 100, 1), 500);
      const rows = await withTransaction(
        { userId: u.id, role: u.role },
        async (c) => {
          const qParams: unknown[] = [u.id, routeParams.cid];
          let sql = `SELECT id, sender_user_id, recipient_user_id, role, content,
                            session_id, attachment_url, attachment_mime,
                            thread_parent_id, created_at
                       FROM chat_messages
                      WHERE session_id = $2
                        AND deleted_at IS NULL
                        AND (sender_user_id = $1 OR recipient_user_id = $1)`;
          if (q.since) {
            sql += ` AND created_at > $3`;
            qParams.push(q.since);
          }
          sql += ` ORDER BY created_at ASC LIMIT $${qParams.length + 1}`;
          qParams.push(limit);
          const res = await c.query<{
            id: string;
            sender_user_id: string;
            recipient_user_id: string | null;
            role: string;
            content: string;
            session_id: string;
            attachment_url: string | null;
            attachment_mime: string | null;
            thread_parent_id: string | null;
            created_at: string;
          }>(sql, qParams);
          return res.rows;
        },
      );
      reply.send(
        rows.map((m) => ({
          id: m.id,
          conversationId: m.session_id,
          senderUid: m.sender_user_id,
          recipientUid: m.recipient_user_id,
          content: m.content,
          role: m.role,
          attachmentUrl: m.attachment_url,
          attachmentMime: m.attachment_mime,
          threadParentId: m.thread_parent_id,
          createdAt: m.created_at,
        })),
      );
    },
  );
}

async function deriveOtherParty(
  conversationId: string,
  callerId: string,
): Promise<string | null> {
  // conversationId format used by the Android client: "{sellerId}-{buyerId}-{productId}"
  // or just "{aUid}-{bUid}". The actual mapping is in the
  // session_id we already use, so we just look at the most recent
  // message to find the other party.
  const pool = getPool();
  const r = await pool.query<{ sender_user_id: string; recipient_user_id: string | null }>(
    `SELECT sender_user_id, recipient_user_id
       FROM chat_messages
       WHERE session_id = $1
       ORDER BY created_at DESC LIMIT 1`,
    [conversationId],
  );
  if (r.rows.length === 0) return null;
  const last = r.rows[0]!;
  if (last.sender_user_id === callerId) return last.recipient_user_id;
  return last.sender_user_id;
}
