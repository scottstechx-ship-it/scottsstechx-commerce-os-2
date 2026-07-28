-- 0001_init.sql — initial schema for ScottsTechX Uganda MVP.
-- Designed to be Supabase-portable. The `app` role is the application connection
-- role; `migrator` is the role that owns DDL. The roles and grants are set up
-- in 0002_rls.sql.

-- =========================================================
-- Extensions
-- =========================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================================
-- Enums
-- =========================================================
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('buyer', 'driver', 'seller', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM (
    'created', 'paid', 'assigned', 'picked_up', 'delivered', 'cancelled', 'refunded'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================
-- Core tables
-- =========================================================
CREATE TABLE IF NOT EXISTS users (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           text UNIQUE NOT NULL,
  display_name    text NOT NULL,
  role            user_role NOT NULL DEFAULT 'buyer',
  password_hash   text,                              -- bcrypt, populated by app
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seller_profiles (
  user_id              uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  business_name        text NOT NULL,
  national_id_number   text UNIQUE,
  business_reg_no      text,
  seller_trust_score   numeric(5,2) DEFAULT 50.00 CHECK (seller_trust_score BETWEEN 0 AND 100),
  total_completed_orders integer NOT NULL DEFAULT 0,
  total_disputes       integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS driver_profiles (
  user_id              uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  national_id_number   text UNIQUE,
  vehicle_plate        text,
  driver_trust_score   numeric(5,2) DEFAULT 50.00 CHECK (driver_trust_score BETWEEN 0 AND 100),
  is_available         boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id         uuid NOT NULL REFERENCES seller_profiles(user_id) ON DELETE CASCADE,
  title             text NOT NULL,
  description       text NOT NULL DEFAULT '',
  price_minor       bigint NOT NULL CHECK (price_minor >= 0),
  currency          char(3) NOT NULL,
  stock_quantity    integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  product_trust_score numeric(5,2) DEFAULT 50.00,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active) WHERE is_active = true;

-- =========================================================
-- FX rates (multi-currency, base UGX for MVP)
-- =========================================================
CREATE TABLE IF NOT EXISTS fx_rates (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  base_currency   char(3) NOT NULL,
  quote_currency  char(3) NOT NULL,
  rate            numeric(18,8) NOT NULL CHECK (rate > 0),
  effective_at    timestamptz NOT NULL DEFAULT now(),
  source          text NOT NULL DEFAULT 'manual',
  UNIQUE (base_currency, quote_currency, effective_at)
);
CREATE INDEX IF NOT EXISTS idx_fx_rates_pair ON fx_rates(base_currency, quote_currency, effective_at DESC);

-- =========================================================
-- Orders + items
-- =========================================================
CREATE TABLE IF NOT EXISTS orders (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id         uuid NOT NULL REFERENCES users(id),
  seller_id           uuid NOT NULL REFERENCES seller_profiles(user_id),
  assigned_driver_id  uuid REFERENCES driver_profiles(user_id),
  total_minor         bigint NOT NULL CHECK (total_minor >= 0),
  currency            char(3) NOT NULL,
  fx_rate_snapshot    numeric(18,8) NOT NULL DEFAULT 1.0,
  status              order_status NOT NULL DEFAULT 'created',
  delivery_address    jsonb NOT NULL,
  pod_pickup_at       timestamptz,
  pod_pickup_lat      numeric(9,6),
  pod_pickup_lng      numeric(9,6),
  pod_delivered_at    timestamptz,
  pod_delivered_lat   numeric(9,6),
  pod_delivered_lng   numeric(9,6),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_driver ON orders(assigned_driver_id) WHERE assigned_driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id          uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id        uuid NOT NULL REFERENCES products(id),
  qty               integer NOT NULL CHECK (qty > 0),
  unit_price_minor  bigint NOT NULL CHECK (unit_price_minor >= 0),
  currency          char(3) NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

-- =========================================================
-- Idempotency keys
-- =========================================================
CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key              text NOT NULL,
  request_hash     text NOT NULL,
  response_status  integer NOT NULL,
  response_body    jsonb NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

-- =========================================================
-- Append-only audit log (tamper evidence via hash chain)
-- =========================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id              bigserial PRIMARY KEY,
  actor_user_id   uuid REFERENCES users(id),
  action          text NOT NULL,
  resource_type   text NOT NULL,
  resource_id     uuid,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash       text,
  row_hash        text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_user_id, created_at DESC);
