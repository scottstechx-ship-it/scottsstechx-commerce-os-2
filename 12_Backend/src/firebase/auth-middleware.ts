/**
 * Firebase ID token auth — accept Firebase auth tokens from the Android
 * client, in addition to the existing HS256 JWT.
 *
 * Strategy:
 *   - If Authorization header starts with "Bearer firebase:" — try
 *     to verify as a Firebase ID token.
 *   - Otherwise — fall back to the existing HS256 JWT verification.
 *
 * The Firebase token's `sub` claim is the Firebase UID. We need to map
 * that to our internal `users.id` (UUID) to keep RLS working. The
 * mapping is: `users.firebase_uid = $1` → `users.id`.
 *
 * If the Firebase user has no row in our `users` table yet, we
 * auto-provision one on first login (with role "buyer" by default;
 * the client can later call /api/v1/auth/upgrade-to-seller).
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyIdToken, firebaseNotReadyReason, isFirebaseReady } from "./admin.js";
import { requireAuth as requireAuthJwt, getAuthUser, type AuthUser } from "../auth.js";
import { UnauthorizedError } from "../errors.js";
import { withTransaction } from "../db.js";

/**
 * Map a Firebase UID to our internal user.id, auto-provisioning if
 * needed. Returns the AuthUser (id, role) the rest of the system
 * expects.
 */
async function provisionOrFetchUser(decoded: {
  uid: string;
  email?: string;
  email_verified?: boolean;
}): Promise<AuthUser> {
  const { getPool } = await import("../db.js");
  const pool = getPool();
  // Look up by firebase_uid
  const lookup = await pool.query<{
    id: string;
    role: "buyer" | "seller" | "admin";
    email: string | null;
  }>(
    `SELECT id, role, email FROM users WHERE firebase_uid = $1 LIMIT 1`,
    [decoded.uid],
  );
  if (lookup.rows.length > 0) {
    const u = lookup.rows[0]!;
    return { id: u.id, role: u.role, email: u.email ?? decoded.email };
  }
  // Auto-provision. We require email_verified to be true for new
  // sign-ups; if the user hasn't verified yet, we 401 so the client
  // can show a "verify your email" screen and re-try.
  if (!decoded.email) {
    throw new UnauthorizedError("firebase_token_missing_email");
  }
  if (!decoded.email_verified) {
    throw new UnauthorizedError("email_not_verified");
  }
  const displayName = decoded.email.split("@")[0]!.slice(0, 60);
  const inserted = await withTransaction(
    { userId: null, role: null },
    async (c) => {
      const res = await c.query<{ id: string }>(
        `INSERT INTO users (firebase_uid, email, display_name, role, email_verified, created_at, updated_at)
         VALUES ($1, $2, $3, 'buyer', TRUE, NOW(), NOW())
         ON CONFLICT (email) DO UPDATE SET firebase_uid = EXCLUDED.firebase_uid,
                                         email_verified = EXCLUDED.email_verified,
                                         updated_at = NOW()
         RETURNING id`,
        [decoded.uid, decoded.email, displayName],
      );
      return res.rows[0]!;
    },
  );
  return { id: inserted.id, role: "buyer", email: decoded.email };
}

/** A preHandler that accepts either Firebase ID token or HS256 JWT. */
export async function requireAuthAny(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    throw new UnauthorizedError("missing bearer token");
  }
  const token = auth.slice("Bearer ".length).trim();
  // Distinguish: a Firebase ID token is 3 base64url segments separated
  // by dots and starts with a JSON header like {"alg":"RS256",...}.
  // We can detect by looking for the "firebase:" prefix the client
  // prefixes OR by attempting verifyIdToken when JWT verification
  // fails. Simpler: the client always sends "Bearer firebase: <idToken>".
  if (token.startsWith("firebase:")) {
    if (!isFirebaseReady()) {
      throw new UnauthorizedError(firebaseNotReadyReason());
    }
    const idToken = token.slice("firebase:".length).trim();
    let decoded: Awaited<ReturnType<typeof verifyIdToken>>;
    try {
      decoded = await verifyIdToken(idToken);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("email-not-verified")) {
        throw new UnauthorizedError("email_not_verified");
      }
      throw new UnauthorizedError(`invalid_firebase_token: ${msg}`);
    }
    const user = await provisionOrFetchUser({
      uid: decoded.uid,
      email: decoded.email,
      email_verified: decoded.email_verified,
    });
    (request as unknown as { user: AuthUser }).user = user;
    return;
  }
  // Fall back to the existing HS256 JWT path.
  await requireAuthJwt(request, _reply);
}

export { getAuthUser };
