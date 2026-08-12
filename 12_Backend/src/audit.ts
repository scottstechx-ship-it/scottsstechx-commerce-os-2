// Adapter that exposes recordAudit() used by user settings routes.
// Wraps the existing audit.ts module which exports insertAuditLog().
import { getPool } from "./db.js";
import { insertAuditLog } from "./modules/audit/audit.js";

export interface AuditEvent {
  userId: string;
  action: string;
  resource?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
}

export async function recordAudit(ev: AuditEvent): Promise<void> {
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      // resource is "table:row_id" — split it.
      const [resourceType, resourceId] = (ev.resource ?? "").split(":", 2);
      await insertAuditLog(client, {
        actor_user_id: ev.userId,
        action: ev.action,
        resource_type: resourceType || "unknown",
        resource_id: resourceId ?? null,
        payload: { before: ev.before, after: ev.after, ip: ev.ip, userAgent: ev.userAgent },
      });
    } finally {
      client.release();
    }
  } catch (err) {
    // Audit failures must never break the user-facing flow.
    // (err as Error).message could be logged here.
  }
}
