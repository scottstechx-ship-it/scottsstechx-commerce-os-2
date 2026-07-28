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
  since: z.string().datetime().optional(),
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
}
