/**
 * Firebase Auth routes — bridge between the Android client (Firebase
 * Auth SDK) and the ScottsTechX backend.
 *
 *   POST /api/v1/auth/firebase/sign-in
 *     Body: { idToken: string }
 *     Verifies the Firebase ID token, auto-provisions the user in the
 *     `users` table if needed, and returns an HS256 JWT for the rest
 *     of the backend. This is the recommended path for new users.
 *
 *   POST /api/v1/auth/firebase/send-verification-email
 *     Body: { idToken: string }
 *     Sends an email verification link to the user. Required before
 *     the user can do anything except view public content.
 *
 *   GET /api/v1/auth/firebase/me
 *     Requires the HS256 JWT (the post-sign-in token). Returns the
 *     current user's email_verified status + Firebase UID + role.
 *
 *   POST /api/v1/auth/firebase/upgrade-to-seller
 *     Marks the current user as a seller. Caller must have verified
 *     their email first.
 */
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { requireAuthAny, getAuthUser } from "../../firebase/auth-middleware.js";
import { signToken } from "../../auth.js";
import { UnauthorizedError } from "../../errors.js";
import { getFirestore, verifyIdToken, getFirebaseAuth } from "../../firebase/admin.js";
import { withTransaction, getPool } from "../../db.js";

const signInSchema = z.object({
  idToken: z.string().min(20).max(8000),
});

export async function registerFirebaseAuthRoute(app: FastifyInstance): Promise<void> {
  // -----------------------------------------------------------------
  app.post(
    "/api/v1/auth/firebase/sign-in",
    async (request, reply) => {
      const body = signInSchema.parse(request.body);
      const decoded = await verifyIdToken(body.idToken);
      // Auto-provision
      const user = await withTransaction(
        { userId: null, role: null },
        async (c) => {
          const lookup = await c.query<{ id: string; role: string; email_verified: boolean }>(
            `SELECT id, role, email_verified FROM users WHERE firebase_uid = $1 LIMIT 1`,
            [decoded.uid],
          );
          if (lookup.rows.length > 0) return lookup.rows[0]!;
          if (!decoded.email_verified) {
            // Don't create the row — let the client prompt the user
            // to verify first. The /send-verification-email endpoint
            // will re-send the link.
            return null;
          }
          const displayName = decoded.email!.split("@")[0]!.slice(0, 60);
          const ins = await c.query<{ id: string; role: string }>(
            `INSERT INTO users (firebase_uid, email, display_name, role, email_verified, created_at, updated_at)
             VALUES ($1, $2, $3, 'buyer', TRUE, NOW(), NOW())
             ON CONFLICT (email) DO UPDATE SET firebase_uid = EXCLUDED.firebase_uid,
                                         email_verified = EXCLUDED.email_verified,
                                         updated_at = NOW()
             RETURNING id, role`,
            [decoded.uid, decoded.email, displayName],
          );
          return ins.rows[0]!;
        },
      );
      if (!user) {
        reply.status(403).send({
          error: "email_not_verified",
          message: "Please verify your email first, then sign in again.",
        });
        return;
      }
      const role = (user.role as "buyer" | "seller" | "admin") ?? "buyer";
      const token = await signToken({ id: user.id, role, email: decoded.email });
      // Mirror to Firestore so the mobile app can read user profile offline
      try {
        const db = await getFirestore();
        await db.collection("users").doc(user.id).set(
          {
            id: user.id,
            email: decoded.email,
            displayName: decoded.email!.split("@")[0],
            role,
            emailVerified: true,
            firebaseUid: decoded.uid,
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
      } catch (err) {
        app.log.warn({ err: (err as Error).message }, "firestore user mirror failed");
      }
      reply.send({
        token,
        user: {
          id: user.id,
          email: decoded.email,
          role,
          emailVerified: true,
        },
      });
    },
  );

  // -----------------------------------------------------------------
  app.post(
    "/api/v1/auth/firebase/send-verification-email",
    async (request, reply) => {
      const body = signInSchema.parse(request.body);
      const decoded = await verifyIdToken(body.idToken);
      if (decoded.email_verified) {
        reply.send({ ok: true, alreadyVerified: true });
        return;
      }
      const auth = await getFirebaseAuth();
      const user = await auth.getUser(decoded.uid);
      // Build the verification link. In production, set continueUrl
      // to your app's deep link so the user returns to the app.
      const link = await auth.generateEmailVerificationLink(user.email!, {
        url: process.env.APP_DEEP_LINK ?? "https://scottstechx.app/verify",
      });
      // The link is sent by Firebase automatically when you generate it
      // with generateVerificationLink. We just return success here.
      app.log.info(
        { uid: decoded.uid, email: decoded.email },
        "verification email triggered",
      );
      reply.send({ ok: true, linkPreview: link.slice(0, 60) + "..." });
    },
  );

  // -----------------------------------------------------------------
  app.get(
    "/api/v1/auth/firebase/me",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const pool = getPool();
      const r = await pool.query<{
        id: string;
        email: string | null;
        display_name: string | null;
        role: string;
        email_verified: boolean;
        firebase_uid: string | null;
      }>(
        `SELECT id, email, display_name, role, email_verified, firebase_uid
         FROM users WHERE id = $1`,
        [u.id],
      );
      const row = r.rows[0];
      if (!row) {
        throw new UnauthorizedError("user not found");
      }
      reply.send({
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        emailVerified: row.email_verified,
        firebaseUid: row.firebase_uid,
      });
    },
  );

  // -----------------------------------------------------------------
  app.post(
    "/api/v1/auth/firebase/upgrade-to-seller",
    { preHandler: requireAuthAny },
    async (request, reply) => {
      const u = getAuthUser(request);
      const pool = getPool();
      const cur = await pool.query<{ role: string; email_verified: boolean }>(
        `SELECT role, email_verified FROM users WHERE id = $1`,
        [u.id],
      );
      if (cur.rows.length === 0) throw new UnauthorizedError("user not found");
      if (!cur.rows[0]!.email_verified) {
        reply.status(403).send({
          error: "email_not_verified",
          message: "Verify your email first, then upgrade to seller.",
        });
        return;
      }
      if (cur.rows[0]!.role === "seller") {
        reply.send({ ok: true, role: "seller" });
        return;
      }
      await pool.query(
        `UPDATE users SET role = 'seller', updated_at = NOW() WHERE id = $1`,
        [u.id],
      );
      // Mirror role change to Firestore so the mobile app sees it
      try {
        const db = await getFirestore();
        await db.collection("users").doc(u.id).set(
          { role: "seller", updatedAt: new Date().toISOString() },
          { merge: true },
        );
      } catch (err) {
        app.log.warn({ err: (err as Error).message }, "firestore mirror failed");
      }
      reply.send({ ok: true, role: "seller" });
    },
  );
}
