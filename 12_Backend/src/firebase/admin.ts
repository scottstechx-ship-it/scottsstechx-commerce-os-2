/**
 * Firebase Admin SDK initializer.
 *
 * ScottsTechX backend uses Firebase for:
 *   - Auth (verify ID tokens from the Android client)
 *   - Firestore (real-time chat, transactions mirror, AI memory)
 *   - Storage (media uploads: chat images, product photos, receipts)
 *
 * Initialization is lazy and idempotent. The service account JSON is
 * read from a local file path in `secrets/firebase-admin-key.json`
 * (gitignored). The file MUST exist before any Firebase-dependent
 * route is hit; if missing, the route returns 503 firebase_not_configured.
 *
 * Why a file path and not env-var JSON: the private key in the JSON
 * is a PEM block with literal newlines; embedding it in `.env` requires
 * awkward escaping. The file path approach is also safer (the JSON
 * file can be 0600 on disk).
 *
 * Set the env var FIREBASE_ADMIN_KEY_PATH to override the default.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import * as adminNs from "firebase-admin";
import type { App } from "firebase-admin/app";
import type { Firestore } from "firebase-admin/firestore";
import type { Auth } from "firebase-admin/auth";
import type { Storage } from "firebase-admin/storage";

export const FIREBASE_PROJECT_ID = "scottstechx-52bab";
const DEFAULT_KEY_PATH = resolve(
  process.cwd(),
  "secrets",
  "firebase-admin-key.json",
);

let _app: App | null = null;
let _initError: string | null = null;

/** True if Firebase is configured and usable. */
export function isFirebaseReady(): boolean {
  return _app !== null;
}

/** Reason Firebase is not configured (for 503 responses). */
export function firebaseNotReadyReason(): string {
  if (_initError) return _initError;
  if (_app === null) return "firebase_not_initialized";
  return "unknown";
}

/** Lazily initialize Firebase. Returns the App or null. */
export async function ensureFirebase(): Promise<App | null> {
  if (_app) return _app;
  if (_initError) return null;
  const keyPath = process.env.FIREBASE_ADMIN_KEY_PATH ?? DEFAULT_KEY_PATH;
  if (!existsSync(keyPath)) {
    _initError = `firebase_admin_key_not_found: ${keyPath}`;
    return null;
  }
  try {
    _app = adminNs.initializeApp({
      credential: adminNs.credential.cert(keyPath),
      projectId: FIREBASE_PROJECT_ID,
    });
    return _app;
  } catch (err) {
    _initError = `firebase_init_failed: ${(err as Error).message}`;
    return null;
  }
}

/** Get Firestore client. Throws if not configured. */
export async function getFirestore(): Promise<Firestore> {
  await ensureFirebase();
  return adminNs.firestore();
}

/** Get Firebase Auth client. Throws if not configured. */
export async function getFirebaseAuth(): Promise<Auth> {
  await ensureFirebase();
  return adminNs.auth();
}

/** Get Firebase Storage client. Throws if not configured. */
export async function getFirebaseStorage(): Promise<Storage> {
  await ensureFirebase();
  return adminNs.storage();
}

/** Default Storage bucket name for this project. */
export const STORAGE_BUCKET = `${FIREBASE_PROJECT_ID}.appspot.com`;

/**
 * Verify a Firebase ID token from the Android client.
 * Returns the decoded claims (uid, email, email_verified, custom claims).
 * Throws if the token is invalid or expired.
 */
export async function verifyIdToken(idToken: string) {
  const auth = await getFirebaseAuth();
  return auth.verifyIdToken(idToken, true); // checkRevoked = true
}
