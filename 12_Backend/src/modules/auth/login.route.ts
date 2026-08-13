import { z } from "zod";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import { signToken, requireAuth, getAuthUser, type AuthUser, type UserRole } from "../../auth.js";
import { withTransaction } from "../../db.js";
import { AppError } from "../../errors.js";

const SALT_ROUNDS = 10;

// Login accepts EITHER phone, email, OR username (one of them is required).
// Phone is the primary identifier for the Uganda market (most users
// don't reliably check email), but email/password sign-in is supported
// for desktop users, and username is supported for both.
//
// integrityToken and deviceFingerprint use .nullish() (not .optional())
// so the Android client can explicitly send `null` for fields it doesn't
// have. With plain .optional(), Zod would reject a payload that includes
// the key with a null value, which is the shape Retrofit's @Body generates
// for nullable Kotlin fields.
export const loginBodySchema = z
  .object({
    phone: z.string().min(10).nullish(),
    email: z.string().email().nullish(),
    username: z.string().min(3).max(32).nullish(),
    password: z.string().min(4),
    role: z.enum(["buyer", "seller", "admin"]),
    integrityToken: z.string().nullish(),
    deviceFingerprint: z.string().nullish(),
  })
  // Strict mode = one identifier, not two. Login uses username OR
  // email OR phone, never a mix — otherwise the identifierCol picker
  // picks whichever comes first, which surprised users in QA.
  .refine(
    (d) => [d.phone, d.email, d.username].filter(Boolean).length === 1,
    { message: "Provide exactly one of phone, email, or username" },
  );

export type LoginBody = z.infer<typeof loginBodySchema>;

// Registration now collects BOTH phone and email so the user can sign in
// via either later. Phone is required (primary identifier); email is
// optional but recommended (lets the user recover via email if they lose
// their phone). role is required — onboarding without a role is invalid
// because every downstream endpoint keys on it.
export const registerBodySchema = z.object({
  phone: z.string().min(10),
  email: z.string().email().optional(),
  password: z.string().min(4),
  fullName: z.string().min(2),
  role: z.enum(["buyer", "seller"]),
  businessName: z.string().optional(),
  locationLat: z.number().min(-90).max(90).optional(),
  locationLng: z.number().min(-180).max(180).optional(),
});

export type RegisterBody = z.infer<typeof registerBodySchema>;

export async function registerLoginRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/v1/auth/register
  app.post("/api/v1/auth/register", async (request, reply) => {
    const body = registerBodySchema.parse(request.body);

    const result = await withTransaction({ userId: null }, async (c) => {
      // Check if user already exists by phone OR email
      const existing = await c.query(
        "SELECT id FROM users WHERE phone = $1 OR ($2::text IS NOT NULL AND email = $2)",
        [body.phone, body.email ?? null],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        throw new AppError(409, "user_already_exists", "User with this phone or email already exists");
      }

      const passwordHash = await bcrypt.hash(body.password, SALT_ROUNDS);

      // The users.email column is UNIQUE NOT NULL. If the caller didn't
      // supply an email, derive a placeholder from the phone (e.g.
      // "+256700000001@noemail.scottstechx.test") so the NOT NULL passes
      // and the user can later set a real email. The placeholder domain
      // is filtered out of any "find by email" flows — it can never be
      // confused with a real address.
      const emailValue =
        body.email ??
        (body.phone.replace(/[^0-9]/g, "") + "@noemail.scottstechx.test");

      const inserted = await c.query<{ id: string }>(
        `INSERT INTO users (display_name, phone, email, role, password_hash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [body.fullName, body.phone, emailValue, body.role, passwordHash]
      );

      const userId = inserted.rows[0]!.id;

      if (body.role === "seller") {
              // 0005_marketplace.sql added lat/lng/address/business_description columns.
              // The Zod schema accepts locationLat/lng as optional; persist them so the
              // /sellers/nearby query (which filters by lat/lng NOT NULL) actually
              // returns the freshly registered seller.
              await c.query(
                `INSERT INTO seller_profiles
                   (user_id, business_name, lat, lng, address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                  userId,
                  body.businessName ?? `${body.fullName}'s Shop`,
                  body.locationLat ?? null,
                  body.locationLng ?? null,
                  null,
                ]
              );
      }

      return {
        userId,
        success: true,
        displayName: body.fullName, // so the client can greet the user by name without a /me round-trip
        role: body.role,
      };
    });

    reply.status(201).send(result);
  });

  // POST /api/v1/auth/login
  // Accepts either phone OR email as the identifier. Role is still
  // required (a user may exist under multiple roles with the same phone,
  // so the caller must specify which one they're logging into).
  app.post("/api/v1/auth/login", async (request, reply) => {
    const body = loginBodySchema.parse(request.body);

    const user = await withTransaction({ userId: null }, async (c) => {
      // Precedence: username > email > phone. The login route accepts any
      // of the three as the identifier; we pick the first non-empty one
      // and use its column name for the SELECT. Migration 0019 added
      // the `username` column with a partial unique index.
      const identifierCol = body.username ? "username" : body.email ? "email" : "phone";
      // Username is normalized to lowercase on both sides (the partial
      // unique index on users.username is on lower(username)).
      const identifierVal = body.username
        ? (body.username.toLowerCase())
        : (body.email ?? body.phone);
      const res = await c.query<{
        id: string;
        display_name: string;
        password_hash: string | null;
        role: string;
        phone: string;
        email: string;
      }>(
        // For username we lowercase the column side because the partial
      // unique index is lower(username) — keeps login "case insensitive"
      // without needing the user to remember how they typed it.
      `SELECT id, display_name, password_hash, role, phone, email
         FROM users
        WHERE ${identifierCol === 'username' ? 'LOWER(username)' : identifierCol} = $1 AND role = $2`,
        [identifierVal, body.role]
      );

      if (!res.rowCount || res.rowCount === 0) {
        throw new AppError(401, "invalid_credentials", "Invalid credentials or role");
      }

      const userRow = res.rows[0]!;
      if (!userRow.password_hash) {
        throw new AppError(401, "invalid_credentials", "User has no password (try Google sign-in)");
      }

      const isValid = await bcrypt.compare(body.password, userRow.password_hash);
      if (!isValid) {
        throw new AppError(401, "invalid_credentials", "Invalid password");
      }

      return userRow;
    });

    const authUser: AuthUser = { id: user.id, role: user.role as UserRole };
    const token = await signToken(authUser);

    reply.send({
      token,
      userId: user.id,
      role: user.role,
      displayName: user.display_name, // real name so the client can render "Good morning, Achieng" without a /me round-trip
      email: user.email,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
  });

  // Returns the authenticated user's profile so the client can
  // display the real displayName, email, phone, loyalty points
  // without re-reading localStorage.
  app.get(
    "/api/v1/auth/me",
    { preHandler: requireAuth },
    async (request, reply) => {
      const u = getAuthUser(request);
      const result = await withTransaction({ userId: u.id }, async (c) => {
        const r = await c.query<{
          id: string;
          display_name: string;
          phone: string;
          email: string | null;
          role: string;
          username: string | null;
          avatar_url: string | null;
          market_name: string | null;
        }>(
          `SELECT u.id, u.display_name, u.phone, u.email, u.role,
                  u.username, u.avatar_url,
                  sp.market_name
             FROM users u
             LEFT JOIN seller_profiles sp ON sp.user_id = u.id
            WHERE u.id = $1`,
          [u.id],
        );
        return r.rows[0] ?? null;
      });
      if (!result) throw new AppError(404, "not_found", "user not found");
      reply.send({
        id: result.id,
        displayName: result.display_name,
        phone: result.phone,
        email: result.email,
        role: result.role,
        username: result.username,
        marketName: result.market_name,
        avatarUrl: result.avatar_url,
      });
    },
  );

  // PATCH /api/v1/auth/me — update the caller's profile. All fields
  // optional so a single call can change just one (e.g. only the phone,
  // or only the password). The contract is intentionally small: the
  // settings/profile UI only needs display_name, phone, and password
  // to be editable right now. Email is NOT editable here because the
  // backend uses email as a unique login key and a verification flow
  // would have to ship with it.
  app.patch(
    "/api/v1/auth/me",
    { preHandler: requireAuth },
    async (request, reply) => {
      const u = getAuthUser(request);
      const body = z.object({
        displayName: z.string().min(1).max(100).optional(),
        phone: z.string().min(10).max(20).optional(),
        // Email is now editable too (the verification-flow ship was
        // scoped out earlier). For the embedded MVP we just keep the
        // existing email behaviour — no verification, but the user can
        // change it from the Edit Profile screen.
        email: z.string().email().max(200).optional(),
        // Username (login handle). Optional, immutable once set in this
        // MVP — see _unameImmutable check below.
        username: z.string().min(3).max(32).regex(/^[a-z0-9_.-]+$/i).optional(),
        // Market name is only meaningful for sellers. Stored on users
        // table as the storefront display name.
        marketName: z.string().min(1).max(120).optional(),
        // Avatar URL (or content:// URI for the local photo picker).
        avatarUrl: z.string().min(1).max(2048).optional(),
        // Current password is required when changing to a new one. This
        // prevents a thief from changing the password if they have a
        // short-lived session token but not the password itself.
        currentPassword: z.string().min(1).max(200).optional(),
        // The password change path is intentionally separate from
        // /auth/login (which still accepts the OLD password in the body)
        // — here we accept the new password, hash it server-side, and
        // never echo it back.
        newPassword: z.string().min(4).max(200).optional(),
      }).parse(request.body);

      if (!body.displayName && !body.phone && !body.email && !body.username &&
          !body.marketName && !body.avatarUrl && !body.newPassword) {
        throw new AppError(400, "no_changes", "Provide at least one field to update");
      }

      // If changing the password, verify the current one first.
      if (body.newPassword) {
        const cur = await withTransaction({ userId: u.id }, async (c) => {
          const r = await c.query(`SELECT password_hash FROM users WHERE id = $1`, [u.id]);
          return r.rows[0]?.password_hash ?? null;
        });
        if (!cur || !(await bcrypt.compare(body.currentPassword ?? "", cur))) {
          throw new AppError(401, "wrong_password",
            "Current password is required to change the password");
        }
      }

      // Username immutability check: once a user has a non-null
      // username they cannot change it (it acts as their stable
      // login handle). The migration 0019 added the column and
      // registration does not set it; once a user sets it from the
      // Edit Profile screen it's permanent.
      if (body.username) {
        const cur = await withTransaction({ userId: u.id }, async (c) => {
          const r = await c.query(`SELECT username FROM users WHERE id = $1`, [u.id]);
          return r.rows[0]?.username ?? null;
        });
        if (cur && cur !== body.username) {
          throw new AppError(409, "username_immutable",
            "Username is set permanently and cannot be changed");
        }
      }

      const newPasswordHash = body.newPassword
        ? await bcrypt.hash(body.newPassword, SALT_ROUNDS)
        : null;

      await withTransaction({ userId: u.id }, async (c) => {
        // Build the SET clause dynamically so only the provided fields
        // are touched. Each param is null when not supplied — the
        // COALESCE in the SQL keeps the existing value.
        await c.query(
          `UPDATE users
              SET display_name = COALESCE($1, display_name),
                  phone        = COALESCE($2, phone),
                  email        = COALESCE($3, email),
                  username     = COALESCE($4, username),
                  avatar_url   = COALESCE($5, avatar_url),
                  password_hash = COALESCE($6, password_hash)
            WHERE id = $7`,
          [body.displayName ?? null, body.phone ?? null, body.email ?? null,
           body.username ?? null, body.avatarUrl ?? null,
           newPasswordHash, u.id],
        );

        // market_name lives on seller_profiles (the seller-only public
        // storefront name). We touch it only if the caller supplied one.
        if (body.marketName) {
          await c.query(
            `UPDATE seller_profiles
                SET market_name = COALESCE($1, market_name)
              WHERE user_id = $2`,
            [body.marketName, u.id],
          );
        }
      });

      // Re-read so the response carries the up-to-date profile (with
      // loyalty points and role) without the client doing a second GET.
      const updated = await withTransaction({ userId: u.id }, async (c) => {
        const r = await c.query(
          `SELECT u.id, u.display_name, u.phone, u.email, u.role,
                  u.username, u.avatar_url,
                  sp.market_name
             FROM users u
             LEFT JOIN seller_profiles sp ON sp.user_id = u.id
            WHERE u.id = $1`,
          [u.id],
        );
        return r.rows[0] ?? null;
      });
      if (!updated) throw new AppError(404, "not_found", "user not found after update");
      reply.send({
        id: updated.id,
        displayName: updated.display_name,
        phone: updated.phone,
        email: updated.email,
        role: updated.role,
        username: updated.username,
        marketName: updated.market_name,
        avatarUrl: updated.avatar_url,
      });
    },
  );

  // Update the user's last known location. Used by the Android
  // buyer's nearby-sellers screen + the seller storefront. Persisted
  // on users.last_known_lat/lng so the server can pre-filter sellers
  // / buyers in the same region without re-running the request.
  app.patch(
    "/api/v1/me/location",
    { preHandler: requireAuth },
    async (request, reply) => {
      const u = getAuthUser(request);
      const body = z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        accuracyMetres: z.number().nonnegative().optional(),
        source: z.enum(["gps", "ip", "manual"]).optional(),
      }).parse(request.body);
      await withTransaction({ userId: u.id, role: u.role }, async (c) => {
        // Update user record
        await c.query(
          `UPDATE users
              SET last_known_lat = $1,
                  last_known_lng = $2,
                  last_location_at = now()
            WHERE id = $3`,
          [body.lat, body.lng, u.id],
        );
        // If the user is a seller, also update their store location
        // so the storefront is discoverable to buyers in the area.
        if (u.role === "seller") {
          await c.query(
            `UPDATE seller_profiles
                SET lat = $1, lng = $2
              WHERE user_id = $3`,
            [body.lat, body.lng, u.id],
          );
        }
      });
      reply.send({
        lat: body.lat,
        lng: body.lng,
        accuracyMetres: body.accuracyMetres ?? null,
        source: body.source ?? "gps",
        recordedAt: new Date().toISOString(),
      });
    },
  );


}
