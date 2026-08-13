-- 0003_seed.sql — minimal seed data for local dev and tests.
-- The password_hash for all three demo users is bcrypt of "demo1234".
-- Generated once and pinned here so the same credentials work in any environment.
--
-- The original seed used email as the unique key. 0007_phone_login.sql added
-- the `phone` column and 0008_seed_geo_update.sql populates phones + lat/lng
-- on existing DBs (and on fresh installs, the upsert in 0008 handles it).

INSERT INTO users (id, email, display_name, role, password_hash) VALUES
  ('11111111-1111-4111-8111-111111111111', 'buyer-demo@scottstechx.test',  'Demo Buyer',  'buyer',  '$2a$10$abcdefghijklmnopqrstuv'),
  ('22222222-2222-4222-8222-222222222222', 'seller-demo@scottstechx.test', 'Demo Seller', 'seller', '$2a$10$abcdefghijklmnopqrstuv'),
  ('33333333-3333-4333-8333-333333333333', 'driver-demo@scottstechx.test', 'Demo Driver', 'driver', '$2a$10$abcdefghijklmnopqrstuv')
ON CONFLICT (email) DO NOTHING;

INSERT INTO seller_profiles (user_id, business_name) VALUES
  ('22222222-2222-4222-8222-222222222222', 'Demo Crafts Uganda')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO driver_profiles (user_id, vehicle_plate) VALUES
  ('33333333-3333-4333-8333-333333333333', 'UAX 001A')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO products (id, seller_id, title, description, price_minor, currency, stock_quantity) VALUES
  ('a1b2c3d4-0001-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Bark cloth tote bag',  'Handmade in Kampala. Reinforced stitching.', 2500000, 'UGX', 25),
  ('a1b2c3d4-0002-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'Ankara laptop sleeve',  'Fits 13" to 15" laptops. Padded.',           4500000, 'UGX', 12),
  ('a1b2c3d4-0003-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'Shea butter 250g',     'Unrefined, cold-pressed. Single origin.',     900000, 'UGX', 60)
ON CONFLICT (id) DO NOTHING;