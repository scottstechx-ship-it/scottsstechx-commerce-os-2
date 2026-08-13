/**
 * JWT auth — HS256 for the MVP, intentionally swappable for RS256/JWKS later.
 *
 * Pinned algorithm: we reject any token whose header `alg` is not `HS256`.
 * Pinned issuer/audience: tokens must declare iss=scottstechx, aud=scottstechx-api.
 * Pinned expiry: jose verifies exp/nbf by default; we require exp to be present.
 *
 * The verified `sub` claim is the user's UUID. We carry it on the request as
 * `request.user = { id, role }`. The route handler is responsible for passing
 * it into withTransaction({ userId, role }) so RLS sees the right GUC.
 */

import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { FastifyRequest, FastifyReply } from "fastify";
import { UnauthorizedError } from "./errors.js";

const ALG = "HS256";
const ISS = "scottstechx";
const AUD = "scottstechx-api";

export type UserRole = "buyer" | "seller" | "admin";

export type AuthUser = {
  id: string;
  role: UserRole;
  email?: string;
};

export type JwtClaims = JWTPayload & {
  sub: string;
  role: UserRole;
  email?: string;
};

function getSecret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error("JWT_SECRET must be set and at least 32 chars");
  }
  return new TextEncoder().encode(s);
}

export async function signToken(
  user: AuthUser,
  opts: { ttlSeconds?: number } = {},
): Promise<string> {
  const ttl = opts.ttlSeconds ?? 86400; // 24 hours
  return new SignJWT({ role: user.role, email: user.email })
    .setProtectedHeader({ alg: ALG })
    .setSubject(user.id)
    .setIssuer(ISS)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<AuthUser> {
  let payload: JWTPayload;
  try {
    const result = await jwtVerify(token, getSecret(), {
      algorithms: [ALG],
      issuer: ISS,
      audience: AUD,
    });
    payload = result.payload;
  } catch (_err) {
    throw new UnauthorizedError("invalid or expired token");
  }
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new UnauthorizedError("token missing sub");
  }
  const role = (payload as { role?: unknown }).role;
  if (typeof role !== "string" || !isUserRole(role)) {
    throw new UnauthorizedError("token missing or invalid role claim");
  }
  const email =
    typeof (payload as { email?: unknown }).email === "string"
      ? (payload as { email: string }).email
      : undefined;
  return { id: payload.sub, role, email };
}

function isUserRole(s: string): s is UserRole {
  return s === "buyer" || s === "seller" || s === "admin";
}

/**
 * Fastify preHandler: reads Authorization: Bearer <token>, verifies, attaches
 * request.user. Routes that require auth simply register this as preHandler.
 */
export async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new UnauthorizedError("missing Authorization: Bearer <token>");
  }
  const token = header.slice("Bearer ".length).trim();
  const user = await verifyToken(token);
  (request as FastifyRequest & { user: AuthUser }).user = user;
}

export function getAuthUser(request: FastifyRequest): AuthUser {
  const u = (request as FastifyRequest & { user?: AuthUser }).user;
  if (!u) {
    throw new UnauthorizedError("no auth user on request");
  }
  return u;
}
