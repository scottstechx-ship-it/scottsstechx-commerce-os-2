-- 0008_product_categories.sql — Add real category support.

ALTER TABLE products ADD COLUMN category text;
CREATE INDEX idx_products_category ON products(category);

-- Seed some categories for existing products based on title
UPDATE products SET category = 'Electronics' WHERE title ILIKE '%phone%' OR title ILIKE '%laptop%' OR title ILIKE '%charger%';
UPDATE products SET category = 'Groceries' WHERE title ILIKE '%milk%' OR title ILIKE '%bread%' OR title ILIKE '%sugar%';
UPDATE products SET category = 'Fashion' WHERE title ILIKE '%shirt%' OR title ILIKE '%shoes%' OR title ILIKE '%dress%';
UPDATE products SET category = 'Home' WHERE title ILIKE '%chair%' OR title ILIKE '%table%' OR title ILIKE '%bed%';
UPDATE products SET category = 'Other' WHERE category IS NULL;
