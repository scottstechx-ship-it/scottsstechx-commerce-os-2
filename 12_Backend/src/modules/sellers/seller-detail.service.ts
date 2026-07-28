import type { Pool, PoolClient } from "pg";

/** Either a Pool or a PoolClient — both have .query(). */
export type QueryExecutor = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type SellerDetail = {
  sellerId: string;
  displayName: string;
  businessName: string;
  businessDescription: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  address: string | null;
  opensAt: string | null;
  closesAt: string | null;
  isVerified: boolean;
  trustScore: number;
  ratingAvg: number;
  ratingCount: number;
  totalCompletedOrders: number;
  totalDisputes: number;
  products: SellerProduct[];
  reviews: SellerReview[];
};

export type SellerProduct = {
  id: string;
  title: string;
  description: string;
  priceMinor: number;
  currency: string;
  stockQuantity: number;
  productTrustScore: number;
};

export type SellerReview = {
  id: string;
  reviewerUserId: string;
  reviewerDisplayName: string;
  rating: number;
  body: string;
  createdAt: string;
};

export async function findSellerDetail(
  client: QueryExecutor,
  sellerId: string,
): Promise<SellerDetail | null> {
  const profile = await client.query<{
    user_id: string;
    display_name: string;
    business_name: string;
    business_description: string | null;
    avatar_url: string | null;
    banner_url: string | null;
    address: string | null;
    opens_at: string | null;
    closes_at: string | null;
    is_verified: boolean;
    seller_trust_score: string;
    rating_avg: string;
    total_reviews: number;
    total_completed_orders: number;
    total_disputes: number;
  }>(
    `SELECT sp.user_id, u.display_name, sp.business_name, sp.business_description,
            sp.avatar_url, sp.banner_url, sp.address, sp.opens_at, sp.closes_at,
            sp.is_verified, sp.seller_trust_score, sp.rating_avg, sp.total_reviews,
            sp.total_completed_orders, sp.total_disputes
       FROM seller_profiles sp
       JOIN users u ON u.id = sp.user_id
      WHERE sp.user_id = $1`,
    [sellerId],
  );
  if (profile.rowCount === 0) return null;
  const p = profile.rows[0]!;

  const productsRes = await client.query<{
    id: string;
    title: string;
    description: string;
    price_minor: string;
    currency: string;
    stock_quantity: number;
    product_trust_score: string;
  }>(
    `SELECT id, title, description, price_minor::text, currency, stock_quantity,
            COALESCE(product_trust_score, 50)::text AS product_trust_score
       FROM products
      WHERE seller_id = $1 AND is_active = true
      ORDER BY created_at DESC
      LIMIT 100`,
    [sellerId],
  );

  const reviewsRes = await client.query<{
    id: string;
    reviewer_user_id: string;
    reviewer_name: string;
    rating: number;
    body: string;
    created_at: string;
  }>(
    `SELECT sr.id, sr.reviewer_user_id, u.display_name AS reviewer_name,
            sr.rating, sr.body, sr.created_at
       FROM seller_reviews sr
       JOIN users u ON u.id = sr.reviewer_user_id
      WHERE sr.seller_id = $1
      ORDER BY sr.created_at DESC
      LIMIT 20`,
    [sellerId],
  );

  return {
    sellerId: p.user_id,
    displayName: p.display_name,
    businessName: p.business_name,
    businessDescription: p.business_description,
    avatarUrl: p.avatar_url,
    bannerUrl: p.banner_url,
    address: p.address,
    opensAt: p.opens_at,
    closesAt: p.closes_at,
    isVerified: p.is_verified,
    trustScore: Number(p.seller_trust_score),
    ratingAvg: Number(p.rating_avg),
    ratingCount: p.total_reviews,
    totalCompletedOrders: p.total_completed_orders,
    totalDisputes: p.total_disputes,
    products: productsRes.rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      priceMinor: Number(r.price_minor),
      currency: r.currency,
      stockQuantity: r.stock_quantity,
      productTrustScore: Number(r.product_trust_score),
    })),
    reviews: reviewsRes.rows.map((r) => ({
      id: r.id,
      reviewerUserId: r.reviewer_user_id,
      reviewerDisplayName: r.reviewer_name,
      rating: r.rating,
      body: r.body,
      createdAt: r.created_at,
    })),
  };
}
