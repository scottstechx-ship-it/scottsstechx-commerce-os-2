/**
 * Firebase Storage helpers — signed upload + download URLs.
 *
 * Why a signed URL: the Android client can't safely hold service
 * account credentials, so the server mints short-lived URLs that
 * grant the client direct read/write access to a specific Storage
 * path. URLs are valid for 15 minutes by default.
 *
 * Layout in Storage:
 *   gs://<bucket>/chat/{conversationId}/{messageId}/{filename}
 *   gs://<bucket>/products/{sellerId}/{productId}/{filename}
 *   gs://<bucket>/receipts/{receiptNumber}.png
 *   gs://<bucket>/avatars/{userId}/{filename}
 */
import { getFirebaseStorage, STORAGE_BUCKET } from "./admin.js";
import { randomUUID } from "node:crypto";

const SIGNED_URL_TTL_MS = 15 * 60 * 1000; // 15 min

export interface SignedUrl {
  url: string;
  gsPath: string;
  expiresAt: number; // unix ms
}

export async function signedUploadUrl(
  objectPath: string,
  contentType: string,
): Promise<SignedUrl> {
  const storage = await getFirebaseStorage();
  const bucket = storage.bucket(STORAGE_BUCKET);
  const file = bucket.file(objectPath);
  const expiresAt = Date.now() + SIGNED_URL_TTL_MS;
  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: expiresAt,
    contentType,
  });
  return { url, gsPath: `gs://${STORAGE_BUCKET}/${objectPath}`, expiresAt };
}

export async function signedDownloadUrl(objectPath: string): Promise<SignedUrl> {
  const storage = await getFirebaseStorage();
  const bucket = storage.bucket(STORAGE_BUCKET);
  const file = bucket.file(objectPath);
  const expiresAt = Date.now() + SIGNED_URL_TTL_MS;
  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: expiresAt,
  });
  return { url, gsPath: `gs://${STORAGE_BUCKET}/${objectPath}`, expiresAt };
}

export async function deleteObject(objectPath: string): Promise<void> {
  const storage = await getFirebaseStorage();
  const bucket = storage.bucket(STORAGE_BUCKET);
  await bucket.file(objectPath).delete({ ignoreNotFound: true });
}

/** Helper to mint a new unique object path. */
export function newChatMediaPath(conversationId: string, ext: string): string {
  const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "").slice(0, 5) || "bin";
  return `chat/${conversationId}/${randomUUID()}.${safeExt}`;
}

export function newProductImagePath(sellerId: string, productId: string, ext: string): string {
  const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "").slice(0, 5) || "jpg";
  return `products/${sellerId}/${productId}/${randomUUID()}.${safeExt}`;
}

export function newAvatarPath(userId: string, ext: string): string {
  const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "").slice(0, 5) || "jpg";
  return `avatars/${userId}/${randomUUID()}.${safeExt}`;
}
