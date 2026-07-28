-- 0004_fx_rates.sql — initial FX rates for multi-currency support.
-- MVP only creates orders in UGX; this table exists so the system can later
-- accept non-UGX products and snapshot the rate at order time.

INSERT INTO fx_rates (base_currency, quote_currency, rate, source) VALUES
  ('UGX', 'USD', 0.000268, 'manual-seed'),  -- 1 UGX ~= 0.000268 USD (approx 3750 UGX/USD)
  ('UGX', 'EUR', 0.000247, 'manual-seed'),
  ('UGX', 'KES', 0.0345,   'manual-seed'),
  ('UGX', 'TZS', 0.705,    'manual-seed'),
  ('UGX', 'GHS', 0.00415,  'manual-seed')
ON CONFLICT (base_currency, quote_currency, effective_at) DO NOTHING;
