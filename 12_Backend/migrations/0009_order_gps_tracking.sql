-- 0009_order_gps_tracking.sql — Add live tracking support.

ALTER TABLE orders ADD COLUMN driver_lat numeric(9,6);
ALTER TABLE orders ADD COLUMN driver_lng numeric(9,6);

-- Initial locations for current orders to avoid NULLs
UPDATE orders SET driver_lat = 0.3476, driver_lng = 32.5825 WHERE driver_lat IS NULL;
