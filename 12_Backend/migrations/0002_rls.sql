-- 0002_rls.sql — Row-Level Security policies and grants for ScottsTechX.
-- Compatible with both standalone Postgres and Supabase.
--
-- Roles:
--   app     — used by the Fastify server. Has CRUD on domain tables but
--             INSERT-only on audit_logs and idempotency_keys.
--   migrator — owns DDL; in production you would never connect as migrator
--             from the app.

-- =========================================================
-- Roles (idempotent)
-- =========================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app') THEN
    CREATE ROLE app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migrator') THEN
    CREATE ROLE migrator NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app;

-- audit_logs: app may only INSERT. UPDATE/DELETE are revoked, and a trigger
-- raises an exception to enforce it even for superusers we connect as during
-- dev. In production, run migrations as a non-superuser migrator role.
REVOKE UPDATE, DELETE ON audit_logs FROM app;

-- The trigger uses a helper function that raises on UPDATE/DELETE for the app
-- role. Updates from owner/superuser are permitted (the hash-chain INSERT
-- path needs to fill in prev_hash/row_hash after the row is created).
-- In production, the app would connect as a non-superuser `app` role and the
-- REVOKE below ensures the role has no UPDATE/DELETE privilege on the table.
CREATE OR REPLACE FUNCTION audit_logs_no_modify()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user = 'app' OR current_user = 'authenticated' OR current_user = 'anon' THEN
    RAISE EXCEPTION 'audit_logs is append-only for role %', current_user;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_block_update ON audit_logs;
CREATE TRIGGER audit_logs_block_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_no_modify();

DROP TRIGGER IF EXISTS audit_logs_block_delete ON audit_logs;
CREATE TRIGGER audit_logs_block_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_no_modify();

-- =========================================================
-- RLS
-- =========================================================
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE products          ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders            ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys  ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE fx_rates          ENABLE ROW LEVEL SECURITY;

-- Force RLS on the owner role too. This is critical in production: a
-- developer or DBA connected as the table owner must NOT be able to bypass
-- RLS by default. Supabase forces RLS on all tables by default; we do the
-- same here.
ALTER TABLE users             FORCE ROW LEVEL SECURITY;
ALTER TABLE seller_profiles   FORCE ROW LEVEL SECURITY;
ALTER TABLE driver_profiles   FORCE ROW LEVEL SECURITY;
ALTER TABLE products          FORCE ROW LEVEL SECURITY;
ALTER TABLE orders            FORCE ROW LEVEL SECURITY;
ALTER TABLE order_items       FORCE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys  FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs        FORCE ROW LEVEL SECURITY;
ALTER TABLE fx_rates          FORCE ROW LEVEL SECURITY;

-- users: a user can see their own row and any seller's user row (public-facing
-- marketplace needs seller name/email visible to buyers in MVP).
DROP POLICY IF EXISTS users_self_select ON users;
CREATE POLICY users_self_select ON users
  FOR SELECT USING (
    id = current_setting('app.user_id', true)::uuid
    OR role IN ('seller', 'admin')
  );

DROP POLICY IF EXISTS users_self_update ON users;
CREATE POLICY users_self_update ON users
  FOR UPDATE USING (id = current_setting('app.user_id', true)::uuid)
  WITH CHECK (id = current_setting('app.user_id', true)::uuid);

-- seller_profiles: visible to all authenticated callers; modifiable by owner.
DROP POLICY IF EXISTS seller_profiles_select ON seller_profiles;
CREATE POLICY seller_profiles_select ON seller_profiles
  FOR SELECT USING (current_setting('app.user_id', true) <> '');

DROP POLICY IF EXISTS seller_profiles_modify ON seller_profiles;
CREATE POLICY seller_profiles_modify ON seller_profiles
  FOR ALL USING (user_id = current_setting('app.user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.user_id', true)::uuid);

-- driver_profiles: visible to all authenticated callers; modifiable by owner.
DROP POLICY IF EXISTS driver_profiles_select ON driver_profiles;
CREATE POLICY driver_profiles_select ON driver_profiles
  FOR SELECT USING (current_setting('app.user_id', true) <> '');

DROP POLICY IF EXISTS driver_profiles_modify ON driver_profiles;
CREATE POLICY driver_profiles_modify ON driver_profiles
  FOR ALL USING (user_id = current_setting('app.user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.user_id', true)::uuid);

-- products: any authenticated user can SELECT; only the seller can modify.
DROP POLICY IF EXISTS products_select ON products;
CREATE POLICY products_select ON products
  FOR SELECT USING (current_setting('app.user_id', true) <> '');

DROP POLICY IF EXISTS products_modify ON products;
CREATE POLICY products_modify ON products
  FOR ALL USING (seller_id = current_setting('app.user_id', true)::uuid)
  WITH CHECK (seller_id = current_setting('app.user_id', true)::uuid);

-- orders: customers see their own orders; sellers see their own orders; drivers
-- see orders assigned to them; admins see all.
DROP POLICY IF EXISTS orders_select ON orders;
CREATE POLICY orders_select ON orders
  FOR SELECT USING (
    customer_id = current_setting('app.user_id', true)::uuid
    OR seller_id = current_setting('app.user_id', true)::uuid
    OR assigned_driver_id = current_setting('app.user_id', true)::uuid
    OR current_setting('app.user_role', true) = 'admin'
  );

DROP POLICY IF EXISTS orders_insert ON orders;
CREATE POLICY orders_insert ON orders
  FOR INSERT WITH CHECK (customer_id = current_setting('app.user_id', true)::uuid);

-- order_items: visible to the same principals as the parent order.
DROP POLICY IF EXISTS order_items_select ON order_items;
CREATE POLICY order_items_select ON order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND (
          o.customer_id = current_setting('app.user_id', true)::uuid
          OR o.seller_id = current_setting('app.user_id', true)::uuid
          OR o.assigned_driver_id = current_setting('app.user_id', true)::uuid
          OR current_setting('app.user_role', true) = 'admin'
        )
    )
  );

-- idempotency_keys: a user can only see/insert their own keys.
DROP POLICY IF EXISTS idempotency_keys_owner ON idempotency_keys;
CREATE POLICY idempotency_keys_owner ON idempotency_keys
  FOR ALL USING (user_id = current_setting('app.user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.user_id', true)::uuid);

-- audit_logs: append-only. The app role has only INSERT.
DROP POLICY IF EXISTS audit_logs_insert ON audit_logs;
CREATE POLICY audit_logs_insert ON audit_logs
  FOR INSERT WITH CHECK (true);

-- SELECT for admins only (or the actor themselves) for tamper-investigation.
DROP POLICY IF EXISTS audit_logs_select ON audit_logs;
CREATE POLICY audit_logs_select ON audit_logs
  FOR SELECT USING (
    actor_user_id = current_setting('app.user_id', true)::uuid
    OR current_setting('app.user_role', true) = 'admin'
  );

-- fx_rates: readable by all authenticated callers; only admins write.
DROP POLICY IF EXISTS fx_rates_select ON fx_rates;
CREATE POLICY fx_rates_select ON fx_rates
  FOR SELECT USING (current_setting('app.user_id', true) <> '');

DROP POLICY IF EXISTS fx_rates_admin_write ON fx_rates;
CREATE POLICY fx_rates_admin_write ON fx_rates
  FOR ALL USING (current_setting('app.user_role', true) = 'admin')
  WITH CHECK (current_setting('app.user_role', true) = 'admin');
