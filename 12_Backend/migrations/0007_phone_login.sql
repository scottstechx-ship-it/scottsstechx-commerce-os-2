-- 0007_phone_login.sql — add phone-based auth for Uganda mass market.
-- Some users may not have email, only a phone number.

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ADD COLUMN phone text UNIQUE;

-- Add national_id_number to driver_profiles if it was missing or for consistency
-- (It was already in 0001_init.sql for seller and driver).
