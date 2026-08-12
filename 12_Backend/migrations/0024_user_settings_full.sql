-- 0024_user_settings_full.sql
-- Stage 5.1 user-facing settings/storage.
--
-- This migration adds the missing columns on `users` plus a full set of
-- per-user tables that the Android app's settings + buyer-protection
-- screens need to read/write.
--
-- Schema additions:
--   users
--     phone                text   -- E.164 / ug-format
--     gender               text   -- 'female' | 'male' | 'other' | 'prefer_not_say'
--     date_of_birth        date
--     bio                  text
--     language             text   -- ISO 639-1 (overrides user_settings.language)
--     currency             text   -- ISO 4217 (overrides user_settings.preferred_currency)
--     buyer_protection_opt_in boolean NOT NULL DEFAULT true
--   user_addresses
--     one row per saved delivery address for the user
--   user_payment_methods
--     one row per saved payment method (mobile money, card, cash)
--   saved_products
--     products the user has bookmarked (a generic "save for later" list)
--   saved_sellers
--     sellers the user follows (overlaps marketplace.followed_sellers
--     but is the canonical "favorite sellers" list)
--   refunds
--     one row per refund request against a receipt / transaction
--   returns
--     one row per product return request
--   support_tickets
--     user-initiated help / contact / report-a-problem tickets
--   cms_content
--     key/value system content (terms, privacy, about, buyer-protection)
--   audit_log
--     append-only audit log of every user action (settings changes,
--     payments, etc.) -- used by the security/audit dashboard

-- ---------------------------------------------------------------------------
-- 1. Extend users
-- ---------------------------------------------------------------------------

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone                text,
  ADD COLUMN IF NOT EXISTS gender               text,
  ADD COLUMN IF NOT EXISTS date_of_birth        date,
  ADD COLUMN IF NOT EXISTS bio                  text,
  ADD COLUMN IF NOT EXISTS language             text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS currency             text NOT NULL DEFAULT 'UGX',
  ADD COLUMN IF NOT EXISTS buyer_protection_opt_in boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS users_phone_idx ON users(phone) WHERE phone IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Saved addresses
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_addresses (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       text NOT NULL DEFAULT 'Home',  -- Home/Work/Other
  recipient   text NOT NULL,
  phone       text,
  line1       text NOT NULL,                  -- street / plot
  line2       text,                           -- apt / suite
  city        text NOT NULL,
  region      text,
  country     text NOT NULL DEFAULT 'UG',
  postal_code text,
  latitude    double precision,
  longitude   double precision,
  is_default  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  updated_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_addresses_user_idx ON user_addresses(user_id);

ALTER TABLE user_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_addresses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_addresses_self ON user_addresses;
CREATE POLICY user_addresses_self ON user_addresses
  USING (user_id::text = current_setting('app.current_user_id', true))
  WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

-- ---------------------------------------------------------------------------
-- 3. Saved payment methods
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_payment_methods (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('mobile_money','card','bank','cash')),
  provider    text,                            -- 'mtn','airtel','visa','mastercard',...
  label       text NOT NULL,                   -- 'MTN Mobile Money', 'Visa **** 4242'
  account     text NOT NULL,                   -- phone number / masked card / IBAN
  is_default  boolean NOT NULL DEFAULT false,
  expires_at  date,                            -- for cards
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  updated_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_payment_methods_user_idx ON user_payment_methods(user_id);

ALTER TABLE user_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_payment_methods FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_payment_methods_self ON user_payment_methods;
CREATE POLICY user_payment_methods_self ON user_payment_methods
  USING (user_id::text = current_setting('app.current_user_id', true))
  WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

-- ---------------------------------------------------------------------------
-- 4. Saved products (separate from the wishlist)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS saved_products (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  saved_at    timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS saved_products_user_idx ON saved_products(user_id, saved_at DESC);

ALTER TABLE saved_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_products FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saved_products_self ON saved_products;
CREATE POLICY saved_products_self ON saved_products
  USING (user_id::text = current_setting('app.current_user_id', true))
  WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

-- ---------------------------------------------------------------------------
-- 5. Saved sellers (favorite sellers)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS saved_sellers (
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id    uuid NOT NULL REFERENCES seller_profiles(user_id) ON DELETE CASCADE,
  saved_at     timestamptz NOT NULL DEFAULT NOW(),
  notify       boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, seller_id)
);

CREATE INDEX IF NOT EXISTS saved_sellers_user_idx ON saved_sellers(user_id, saved_at DESC);

ALTER TABLE saved_sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_sellers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saved_sellers_self ON saved_sellers;
CREATE POLICY saved_sellers_self ON saved_sellers
  USING (user_id::text = current_setting('app.current_user_id', true))
  WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

-- ---------------------------------------------------------------------------
-- 6. Refunds
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS refunds (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_id  uuid,                                  -- nullable -- refunds can be linked to a transaction
  receipt_number  text,                                  -- or to a receipt directly
  amount_minor    bigint NOT NULL,
  currency        text NOT NULL DEFAULT 'UGX',
  reason          text NOT NULL,
  status          text NOT NULL DEFAULT 'requested'
                    CHECK (status IN ('requested','under_review','approved','rejected','paid')),
  notes           text,
  evidence        jsonb NOT NULL DEFAULT '[]'::jsonb,    -- array of attachment URLs
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW(),
  resolved_at     timestamptz
);

CREATE INDEX IF NOT EXISTS refunds_user_idx ON refunds(user_id, created_at DESC);

ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS refunds_self ON refunds;
CREATE POLICY refunds_self ON refunds
  USING (user_id::text = current_setting('app.current_user_id', true))
  WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

-- ---------------------------------------------------------------------------
-- 7. Returns
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS product_returns (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_id  uuid,
  product_id      uuid REFERENCES products(id) ON DELETE SET NULL,
  quantity        integer NOT NULL DEFAULT 1,
  reason          text NOT NULL,
  description     text,
  status          text NOT NULL DEFAULT 'requested'
                    CHECK (status IN ('requested','pickup_scheduled','in_transit','received','refunded','rejected')),
  refund_id       uuid REFERENCES refunds(id) ON DELETE SET NULL,
  tracking_number text,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS product_returns_user_idx ON product_returns(user_id, created_at DESC);

ALTER TABLE product_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_returns FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_returns_self ON product_returns;
CREATE POLICY product_returns_self ON product_returns
  USING (user_id::text = current_setting('app.current_user_id', true))
  WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

-- ---------------------------------------------------------------------------
-- 8. Support tickets (help center / contact / report-a-problem)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS support_tickets (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category        text NOT NULL,            -- 'help','contact','report','feedback'
  subject         text NOT NULL,
  message         text NOT NULL,
  attachment_url  text,
  status          text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','in_progress','awaiting_user','resolved','closed')),
  assigned_to     uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_tickets_user_idx ON support_tickets(user_id, created_at DESC);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS support_tickets_self ON support_tickets;
CREATE POLICY support_tickets_self ON support_tickets
  USING (user_id::text = current_setting('app.current_user_id', true))
  WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

-- ---------------------------------------------------------------------------
-- 9. CMS content (terms, privacy, about, buyer-protection policy)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cms_content (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug        text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,
  version     text NOT NULL DEFAULT '1.0',
  locale      text NOT NULL DEFAULT 'en',
  published   boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (slug, locale)
);

CREATE INDEX IF NOT EXISTS cms_content_slug_idx ON cms_content(slug, locale, published);

-- Seed initial content
INSERT INTO cms_content (slug, title, body, version, locale) VALUES
  ('terms', 'Terms of Service',
   'ScottsTechX is a marketplace operated by Kato Fred (Uganda). By using this app you agree to buy and sell in good faith. All transactions are between buyer and seller; ScottsTechX provides the platform but does not hold funds. Disputes are resolved through our buyer-protection policy. Refunds are processed within 7 business days. Sellers must ship within 3 days of order confirmation.',
   '1.0', 'en'),
  ('privacy', 'Privacy Policy',
   'We collect your email, phone number, and location to facilitate transactions. We never sell your data. Your data is encrypted at rest and in transit. You can request deletion of your account at any time via Settings -> Account -> Delete Account.',
   '1.0', 'en'),
  ('about', 'About ScottsTechX',
   'ScottsTechX is a Ugandan e-commerce marketplace founded by Kato Fred, a cybersecurity analyst, web developer, and software developer. Our mission is to empower local sellers across Uganda with a fast, secure, and easy-to-use platform that connects them with buyers nationwide. Built in Uganda, for Uganda.',
   '1.0', 'en'),
  ('buyer-protection', 'Buyer Protection Policy',
   'Every purchase on ScottsTechX is covered. If your order does not arrive, arrives damaged, or does not match the description, you may open a dispute within 7 days of delivery. We will mediate with the seller and issue a full refund if the claim is verified. ScottsTechX holds the payment in escrow until the buyer confirms receipt. Refunds are processed within 7 business days.',
   '1.0', 'en'),
  ('help', 'Help Center',
   'Browse our FAQ, contact support, or report a problem. Most issues are resolved within 24 hours. For urgent safety concerns, tap the Report button on any product or message.',
   '1.0', 'en'),
  ('contact', 'Contact ScottsTechX',
   'Email: support@scottsx.app\nPhone: +256 700 000000\nOffice: Kampala, Uganda\nHours: Mon-Fri 8am-6pm EAT',
   '1.0', 'en')
ON CONFLICT (slug, locale) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 10. Audit log (every user action)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  action      text NOT NULL,            -- 'settings.update','payment.complete','order.cancel'
  resource    text,                    -- 'user_settings','order:abcd-1234'
  before      jsonb,
  after       jsonb,
  ip          inet,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_user_idx ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log(action, created_at DESC);

-- ---------------------------------------------------------------------------
-- 11. System-wide notification queue (for notifications page)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL,            -- 'order','refund','return','message','promo','system'
  title       text NOT NULL,
  body        text NOT NULL,
  action_url  text,
  deep_link   text,
  icon        text,
  read        boolean NOT NULL DEFAULT false,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications(user_id) WHERE read = false;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_self ON notifications;
CREATE POLICY notifications_self ON notifications
  USING (user_id::text = current_setting('app.current_user_id', true))
  WITH CHECK (user_id::text = current_setting('app.current_user_id', true));
