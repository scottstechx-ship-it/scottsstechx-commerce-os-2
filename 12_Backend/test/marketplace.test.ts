/**
 * Marketplace slice tests: nearby ranking, inventory CRUD, seller detail,
 * dashboard stats, reviews, chat, AI stub behavior, Google OAuth disabled.
 *
 * Boots the embedded-postgres-backed server through the shared setup.ts
 * helper, then exercises each new endpoint.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import {
  setup as setupOnce,
  teardown as teardownOnce,
  getBaseUrl,
  SEED,
  mintToken,
  randomIdempotencyKey,
} from "./setup.js";
import { query } from "../src/db.js";

let baseUrl = "";
let buyerToken = "";
let sellerToken = "";

beforeAll(async () => {
  await setupOnce();
  baseUrl = getBaseUrl();
  buyerToken = await mintToken("buyer", SEED.buyerId);
  sellerToken = await mintToken("seller", SEED.sellerId);
});

afterAll(async () => {
  await teardownOnce();
});

beforeEach(async () => {
  // Place the demo seller at a known location and clear any leftover state.
  await query(`DELETE FROM product_media WHERE product_id = ANY($1::uuid[])`, [
    [SEED.productA, SEED.productB, SEED.productC],
  ]);
  await query(`DELETE FROM seller_reviews WHERE seller_id = $1`, [SEED.sellerId]);
  await query(
    `UPDATE seller_profiles
        SET lat = $1, lng = $2,
            seller_trust_score = 75, rating_avg = 4.5, total_reviews = 10,
            is_verified = true
      WHERE user_id = $3`,
    [0.3476, 32.5825, SEED.sellerId],
  );
});

describe("Marketplace: /api/v1/sellers/nearby", () => {
  it("returns the demo seller within 25km of Kampala", async () => {
  const r = await fetch(
    `${baseUrl}/api/v1/sellers/nearby?lat=0.3476&lng=32.5825&radiusKm=25`,
    { headers: { authorization: `Bearer ${buyerToken}` } },
  );
  expect(r.status).toBe(200);
    const body = (await r.json()) as Array<{ sellerId: string; rankScore: number }>;
    expect(body.length).toBeGreaterThan(0);
    const demo = body.find((s) => s.sellerId === SEED.sellerId);
    expect(demo).toBeDefined();
    expect(demo!.rankScore).toBeGreaterThan(0);
  });

  it("ranks closer seller higher than farther seller (distance weight)", async () => {
    // Insert a second seller 5km away.
    const farId = "99999999-9999-4999-8999-999999999999";
    await query(
      `INSERT INTO users (id, email, display_name, role) VALUES ($1, $2, 'Far', 'seller')
       ON CONFLICT (email) DO NOTHING`,
      [farId, "far-seller@scottstechx.test"],
    );
    await query(
      `INSERT INTO seller_profiles (user_id, business_name, lat, lng, seller_trust_score, rating_avg, total_reviews)
       VALUES ($1, 'Far Shop', 0.3926, 32.5825, 75, 4.5, 10)`,
      [farId],
    );
    // Add one product each so they tie on activity.
    await query(
      `INSERT INTO products (id, seller_id, title, price_minor, currency, stock_quantity, is_active)
       VALUES ('a0000000-0000-4000-8000-000000000099', $1, 'Tote', 2500000, 'UGX', 25, true)
       ON CONFLICT (id) DO NOTHING`,
      [farId],
    );

    const r = await fetch(
      `${baseUrl}/api/v1/sellers/nearby?lat=0.3476&lng=32.5825&radiusKm=25`,
      { headers: { authorization: `Bearer ${buyerToken}` } },
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as Array<{ sellerId: string; distanceMetres: number }>;
    const demo = body.find((s) => s.sellerId === SEED.sellerId);
    const far = body.find((s) => s.sellerId === farId);
    expect(demo).toBeDefined();
    expect(far).toBeDefined();
    expect(demo!.distanceMetres).toBeLessThan(far!.distanceMetres);
    // Sort order: by distance ASC in the SQL, then we sort by rank DESC in the route.
    const demoIdx = body.findIndex((s) => s.sellerId === SEED.sellerId);
    const farIdx = body.findIndex((s) => s.sellerId === farId);
    expect(demoIdx).toBeLessThan(farIdx);
  });

  it("rejects missing lat/lng", async () => {
    const r = await fetch(`${baseUrl}/api/v1/sellers/nearby`, {
      headers: { authorization: `Bearer ${buyerToken}` },
    });
    expect(r.status).toBe(400);
  });

  it("rejects unauthenticated requests", async () => {
    const r = await fetch(`${baseUrl}/api/v1/sellers/nearby?lat=0&lng=0`);
    expect(r.status).toBe(401);
  });
});

describe("Marketplace: /api/v1/sellers/:sellerId", () => {
  it("returns the seller profile + products + reviews", async () => {
    const r = await fetch(`${baseUrl}/api/v1/sellers/${SEED.sellerId}`, {
      headers: { authorization: `Bearer ${buyerToken}` },
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      sellerId: string;
      businessName: string;
      products: Array<{ id: string }>;
    };
    expect(body.sellerId).toBe(SEED.sellerId);
    expect(body.products.length).toBeGreaterThan(0);
  });

  it("404 for unknown seller", async () => {
    const r = await fetch(
      `${baseUrl}/api/v1/sellers/55555555-5555-4555-8555-555555555555`,
      { headers: { authorization: `Bearer ${buyerToken}` } },
    );
    expect(r.status).toBe(404);
  });
});

describe("Marketplace: /api/v1/seller/inventory CRUD", () => {
  it("creates, lists, patches, deletes a product as seller", async () => {
    const create = await fetch(`${baseUrl}/api/v1/seller/inventory`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${sellerToken}`,
        "idempotency-key": randomIdempotencyKey(),
      },
      body: JSON.stringify({
        title: "Test product",
        description: "For the marketplace test",
        priceMinor: 100000,
        currency: "UGX",
        stockQuantity: 10,
      }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as { id: string; title: string };
    expect(created.title).toBe("Test product");

    const list = await fetch(`${baseUrl}/api/v1/seller/inventory`, {
      headers: { authorization: `Bearer ${sellerToken}` },
    });
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as Array<{ id: string }>;
    expect(listBody.some((p) => p.id === created.id)).toBe(true);

    const patch = await fetch(`${baseUrl}/api/v1/seller/inventory/${created.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${sellerToken}`,
        "idempotency-key": randomIdempotencyKey(),
      },
      body: JSON.stringify({ stockQuantity: 5 }),
    });
    expect(patch.status).toBe(200);

    const del = await fetch(`${baseUrl}/api/v1/seller/inventory/${created.id}`, {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${sellerToken}`,
        "idempotency-key": randomIdempotencyKey(),
      },
    });
    expect(del.status).toBe(204);
  });

  it("forbids buyer from listing seller inventory", async () => {
    const r = await fetch(`${baseUrl}/api/v1/seller/inventory`, {
      headers: { authorization: `Bearer ${buyerToken}` },
    });
    expect(r.status).toBe(403);
  });

  it("rejects create without Idempotency-Key", async () => {
    const r = await fetch(`${baseUrl}/api/v1/seller/inventory`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        title: "X",
        description: "Y",
        priceMinor: 100,
        currency: "UGX",
        stockQuantity: 1,
      }),
    });
    expect(r.status).toBe(400);
  });
});

describe("Marketplace: /api/v1/seller/stats and /orders", () => {
  it("returns the seller stats", async () => {
    const r = await fetch(`${baseUrl}/api/v1/seller/stats`, {
      headers: { authorization: `Bearer ${sellerToken}` },
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      sellerId: string;
      activeListings: number;
      currency: string;
    };
    expect(body.sellerId).toBe(SEED.sellerId);
    expect(body.activeListings).toBeGreaterThanOrEqual(0);
    expect(body.currency).toBe("UGX");
  });

  it("returns empty orders list initially", async () => {
    const r = await fetch(`${baseUrl}/api/v1/seller/orders`, {
      headers: { authorization: `Bearer ${sellerToken}` },
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });
});

describe("Marketplace: /api/v1/reviews", () => {
  it("creates a review and updates seller aggregate", async () => {
    const r = await fetch(`${baseUrl}/api/v1/reviews`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${buyerToken}`,
      },
      body: JSON.stringify({
        sellerId: SEED.sellerId,
        rating: 5,
        body: "Great service",
      }),
    });
    expect(r.status).toBe(201);

    const seller = await query<{ rating_avg: string; total_reviews: number }>(
      `SELECT rating_avg, total_reviews FROM seller_profiles WHERE user_id = $1`,
      [SEED.sellerId],
    );
    expect(seller.rows[0]!.total_reviews).toBeGreaterThan(0);
    expect(Number(seller.rows[0]!.rating_avg)).toBeGreaterThan(0);
  });

  it("rejects review with rating out of range", async () => {
    const r = await fetch(`${baseUrl}/api/v1/reviews`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${buyerToken}`,
      },
      body: JSON.stringify({ sellerId: SEED.sellerId, rating: 99, body: "" }),
    });
    expect(r.status).toBe(400);
  });
});

describe("Marketplace: /api/v1/chat/messages", () => {
  it("posts a chat message and lists it back", async () => {
    const session = `test-${Date.now()}`;
    const post = await fetch(`${baseUrl}/api/v1/chat/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${buyerToken}`,
      },
      body: JSON.stringify({
        sessionId: session,
        content: "Hello",
        role: "buyer",
      }),
    });
    expect(post.status).toBe(201);
    const list = await fetch(
      `${baseUrl}/api/v1/chat/messages?sessionId=${session}`,
      { headers: { authorization: `Bearer ${buyerToken}` } },
    );
    expect(list.status).toBe(200);
    const msgs = (await list.json()) as Array<{ content: string }>;
    expect(msgs.some((m) => m.content === "Hello")).toBe(true);
  });
});

describe("Marketplace: /api/v1/ai/*", () => {
  it("/ai/status returns enabled=false without LLM_API_KEY", async () => {
    // The test process inherits env. The setup.ts doesn't set LLM_API_KEY,
    // so the endpoint should report disabled.
    const r = await fetch(`${baseUrl}/api/v1/ai/status`);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { enabled: boolean; provider: string | null };
    expect(body.enabled).toBe(false);
    expect(body.provider).toBeNull();
  });

  it("/ai/seller-suggest returns 503 ai_disabled without a key", async () => {
    const r = await fetch(`${baseUrl}/api/v1/ai/seller-suggest`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({ type: "product_description", draft: { text: "tote bag" } }),
    });
    expect(r.status).toBe(503);
    const body = (await r.json()) as { error: string };
    expect(body.error).toBe("ai_disabled");
  });

  it("/ai/customer-chat returns 503 ai_disabled without a key", async () => {
    const r = await fetch(`${baseUrl}/api/v1/ai/customer-chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${buyerToken}`,
      },
      body: JSON.stringify({ sessionId: "x", message: "hi" }),
    });
    expect(r.status).toBe(503);
  });
});

describe("Marketplace: /api/v1/auth/google", () => {
  it("returns 503 google_auth_disabled when GOOGLE_CLIENT_ID is unset", async () => {
    const r = await fetch(`${baseUrl}/api/v1/auth/google`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: "fake" }),
    });
    expect(r.status).toBe(503);
    const body = (await r.json()) as { error: string };
    expect(body.error).toBe("google_auth_disabled");
  });

  it("validates idToken is present", async () => {
    const r = await fetch(`${baseUrl}/api/v1/auth/google`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: "x" }),
    });
    expect(r.status).toBe(503); // disabled takes precedence over validation
  });
});

describe("Marketplace: security headers", () => {
  it("sets X-Content-Type-Options and Referrer-Policy on every response", async () => {
    const r = await fetch(`${baseUrl}/healthz`);
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
    expect(r.headers.get("x-frame-options")).toBe("DENY");
  });
});

describe("Marketplace: rate limit", () => {
  it("rejects excessive AI calls with 429", async () => {
    const headers = {
      "content-type": "application/json",
      authorization: `Bearer ${sellerToken}`,
    };
    let lastStatus = 0;
    let lastRetry = "";
    for (let i = 0; i < 80; i++) {
      const r = await fetch(`${baseUrl}/api/v1/ai/seller-suggest`, {
        method: "POST",
        headers,
        body: JSON.stringify({ type: "category", draft: { text: "x" } }),
      });
      lastStatus = r.status;
      lastRetry = r.headers.get("retry-after") ?? "";
      if (r.status === 429) break;
    }
    expect(lastStatus).toBe(429);
    expect(Number(lastRetry)).toBeGreaterThan(0);
  });
});
