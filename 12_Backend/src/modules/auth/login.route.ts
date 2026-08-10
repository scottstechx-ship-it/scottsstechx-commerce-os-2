import { z } from "zod";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import { signToken, type AuthUser, type UserRole } from "../../auth.js";
import { withTransaction } from "../../db.js";
import { AppError } from "../../errors.js";

const SALT_ROUNDS = 10;

export const loginBodySchema = z.object({
  phone: z.string().min(10),
  password: z.string().min(4),
  role: z.enum(["buyer", "driver", "seller"]),
  integrityToken: z.string().optional(),
  deviceFingerprint: z.string().optional(),
});

export type LoginBody = z.infer<typeof loginBodySchema>;

export const registerBodySchema = z.object({
  phone: z.string().min(10),
  password: z.string().min(4),
  fullName: z.string().min(2),
  role: z.enum(["buyer", "driver", "seller"]),
  businessName: z.string().optional(),
  locationLat: z.number().optional(),
  locationLng: z.number().optional(),
});

export type RegisterBody = z.infer<typeof registerBodySchema>;

export async function registerLoginRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/v1/auth/register
  app.post("/api/v1/auth/register", async (request, reply) => {
    const body = registerBodySchema.parse(request.body);

    const result = await withTransaction({ userId: null }, async (c) => {
      // Check if user already exists
      const existing = await c.query("SELECT id FROM users WHERE phone = $1", [body.phone]);
      if (existing.rowCount && existing.rowCount > 0) {
        throw new AppError("user_already_exists", "User with this phone number already exists", 409);
      }

      const passwordHash = await bcrypt.hash(body.password, SALT_ROUNDS);

      const inserted = await c.query<{ id: string }>(
        `INSERT INTO users (display_name, phone, role, password_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [body.fullName, body.phone, body.role, passwordHash]
      );

      const userId = inserted.rows[0]!.id;

      if (body.role === "seller") {
        await c.query(
          `INSERT INTO seller_profiles (user_id, business_name)
           VALUES ($1, $2)`,
          [userId, body.businessName ?? `${body.fullName}'s Shop`]
        );
      } else if (body.role === "driver") {
        await c.query(
          `INSERT INTO driver_profiles (user_id) VALUES ($1)`,
          [userId]
        );
      }

      return { userId, success: true };
    });

    reply.status(201).send(result);
  });

  // POST /api/v1/auth/login
  app.post("/api/v1/auth/login", async (request, reply) => {
    const body = loginBodySchema.parse(request.body);

    const user = await withTransaction({ userId: null }, async (c) => {
      const res = await c.query<{
        id: string;
        password_hash: string | null;
        role: string;
        phone: string;
      }>(
        "SELECT id, password_hash, role, phone FROM users WHERE phone = $1 AND role = $2",
        [body.phone, body.role]
      );

      if (!res.rowCount || res.rowCount === 0) {
        throw new AppError("invalid_credentials", "Invalid phone or role", 401);
      }

      const userRow = res.rows[0]!;
      if (!userRow.password_hash) {
        throw new AppError("invalid_credentials", "User has no password (try Google sign-in)", 401);
      }

      const isValid = await bcrypt.compare(body.password, userRow.password_hash);
      if (!isValid) {
        throw new AppError("invalid_credentials", "Invalid password", 401);
      }

      return userRow;
    });

    const authUser: AuthUser = { id: user.id, role: user.role as UserRole };
    const token = await signToken(authUser);

    reply.send({
      token,
      userId: user.id,
      role: user.role,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
  });
}
