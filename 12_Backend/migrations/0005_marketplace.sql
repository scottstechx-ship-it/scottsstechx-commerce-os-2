-- 0005_marketplace.sql
-- ScottsTechX Uganda marketplace slice:
--   - Seller location + profile extension fields
--   - Product media (gallery)
--   - Seller reviews
--   - Chat messages
--   - AI suggestions (audit log of AI calls)
--
-- All additions use IF NOT EXISTS so re-running is safe.
-- RLS policies live in 0006_rls_marketplace.sql.

-- =========================================================
-- Seller profile extension
-- =========================================================
ALTER TABLE seller_profiles
  ADD COLUMN IF NOT EXISTS lat                   double precision,
  ADD COLUMN IF NOT EXISTS lng                   double precision,
  ADD COLUMN IF NOT EXISTS address               text,
  ADD COLUMN IF NOT EXISTS business_description  text,
  ADD COLUMN IF NOT EXISTS avatar_url            text,
  ADD COLUMN IF NOT EXISTS banner_url            text,
  ADD COLUMN IF NOT EXISTS opens_at              time,
  ADD COLUMN IF NOT EXISTS closes_at             time,
  ADD COLUMN IF NOT EXISTS is_verified           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS total_reviews         integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_avg            numeric(3,2) NOT NULL DEFAULT 0.00;

-- Index for the nearby-sellers query: filter to sellers with a location,
-- then order by lat/lng bounding box before applying Haversine.
CREATE INDEX IF NOT EXISTS idx_seller_profiles_location
  ON seller_profiles(lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;

-- =========================================================
-- Product media (gallery)
-- =========================================================
CREATE TABLE IF NOT EXISTS product_media (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url         text NOT NULL,
  alt_text    text,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_media_product
  ON product_media(product_id, position);

-- =========================================================
-- Seller reviews
-- =========================================================
CREATE TABLE IF NOT EXISTS seller_reviews (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id         uuid NOT NULL REFERENCES seller_profiles(user_id) ON DELETE CASCADE,
  reviewer_user_id  uuid NOT NULL REFERENCES users(id),
  rating            integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body              text NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_seller_reviews_seller
  ON seller_reviews(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seller_reviews_reviewer
  ON seller_reviews(reviewer_user_id);

-- =========================================================
-- Chat messages (buyer <-> seller or buyer <-> AI)
-- =========================================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_user_id      uuid NOT NULL REFERENCES users(id),
  recipient_user_id   uuid REFERENCES users(id),
  role                text NOT NULL CHECK (role IN ('buyer','seller','ai','system')),
  content             text NOT NULL,
  session_id          text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session
  ON chat_messages(session_id, created_at);

-- =========================================================
-- AI suggestion audit log
-- =========================================================
CREATE TABLE IF NOT EXISTS ai_suggestions (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id       uuid REFERENCES seller_profiles(user_id) ON DELETE CASCADE,
  user_id         uuid REFERENCES users(id),
  suggestion_type text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  accepted        boolean,
  provider        text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_seller
  ON ai_suggestions(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_type
  ON ai_suggestions(suggestion_type, created_at DESC);
