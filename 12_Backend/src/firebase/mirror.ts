/**
 * Firestore mirror — write-through layer for Android client.
 *
 * Every user-facing mutation (transaction, receipt, dispute, AI
 * preference, wishlist item) is mirrored to Firestore under the
 * user's doc tree. The mobile app reads from Firestore first and
 * falls back to the REST API. This gives:
 *   - real-time updates (snapshot listeners)
 *   - offline cache (Firestore SDK)
 *   - server-authoritative security rules
 *
 * Mirrors are best-effort: a Firestore write failure is logged but
 * does NOT fail the REST call, because Postgres remains the source
 * of truth and the next mutation will re-mirror. (We will add a
 * reconciliation cron in stage 4b that finds drift.)
 */
import { getFirestore } from "./admin.js";
import type { FieldValue } from "firebase-admin/firestore";

/** Write or merge a doc under the user's tree. */
export async function mirrorToUserDoc(
  userId: string,
  collection: string,
  docId: string,
  data: Record<string, unknown>,
  opts: { merge?: boolean } = { merge: true },
): Promise<void> {
  try {
    const db = await getFirestore();
    const ref = db.collection("users").doc(userId).collection(collection).doc(docId);
    if (opts.merge) {
      await ref.set(data, { merge: true });
    } else {
      await ref.set(data);
    }
  } catch (err) {
    console.warn(
      `[firestore-mirror] failed to write users/${userId}/${collection}/${docId}:`,
      (err as Error).message,
    );
  }
}

/** Write to a top-level collection (e.g. products/, stores/). */
export async function mirrorToCollection(
  collection: string,
  docId: string,
  data: Record<string, unknown>,
  opts: { merge?: boolean } = { merge: true },
): Promise<void> {
  try {
    const db = await getFirestore();
    const ref = db.collection(collection).doc(docId);
    if (opts.merge) {
      await ref.set(data, { merge: true });
    } else {
      await ref.set(data);
    }
  } catch (err) {
    console.warn(
      `[firestore-mirror] failed to write ${collection}/${docId}:`,
      (err as Error).message,
    );
  }
}

/** Delete a doc from a user's tree. */
export async function deleteUserDoc(
  userId: string,
  collection: string,
  docId: string,
): Promise<void> {
  try {
    const db = await getFirestore();
    await db.collection("users").doc(userId).collection(collection).doc(docId).delete();
  } catch (err) {
    console.warn(
      `[firestore-mirror] failed to delete users/${userId}/${collection}/${docId}:`,
      (err as Error).message,
    );
  }
}

/** Bump a server timestamp on a doc. */
export async function touchUserDoc(
  userId: string,
  collection: string,
  docId: string,
): Promise<void> {
  try {
    const db = await getFirestore();
    const ts = (await import("firebase-admin/firestore")).FieldValue.serverTimestamp();
    await db
      .collection("users")
      .doc(userId)
      .collection(collection)
      .doc(docId)
      .set({ updatedAt: ts }, { merge: true });
  } catch (err) {
    // best-effort
  }
}

/** Build a Firestore FieldValue helper for callers. */
export async function serverTimestamp(): Promise<FieldValue> {
  const fs = await import("firebase-admin/firestore");
  return fs.FieldValue.serverTimestamp();
}
