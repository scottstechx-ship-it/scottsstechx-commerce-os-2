// Comprehensive seed for ScottsTechX marketplace.
// Updates existing seeded users, refreshes their shops + locations,
// wipes products, and inserts 24 fresh realistic products (4 per category).
import { getPool } from './dist/db.js';

const pool = getPool();

const SELLERS = [
  {
    uid: '22222222-2222-4222-8222-222222222221', email: '[email protected]',
    displayName: 'TechHub Uganda', storeName: 'TechHub Uganda',
    description: 'Authentic gadgets, original warranty, fast delivery in Kampala.',
    phone: '+256700000004', latitude: 0.3476, longitude: 32.5825,
  },
  {
    uid: '22222222-2222-4222-8222-222222222222', email: '[email protected]',
    displayName: 'SneakerKing', storeName: 'SneakerKing UG',
    description: 'Authentic sneakers and streetwear. New drops weekly.',
    phone: '+256700000005', latitude: 0.3163, longitude: 32.5822,
  },
  {
    uid: '22222222-2222-4222-8222-222222222223', email: '[email protected]',
    displayName: 'Glamour Cosmetics', storeName: 'Glamour Cosmetics',
    description: 'Premium beauty and skincare from international brands.',
    phone: '+256700000006', latitude: 0.3500, longitude: 32.5900,
  },
  {
    uid: '11111111-1111-4111-8111-111111111111', email: '[email protected]',
    displayName: 'Home Appliances', storeName: 'Home Appliances UG',
    description: 'Kitchen, laundry, and home electronics. Free delivery above 500k UGX.',
    phone: '+256700000001', latitude: 0.3050, longitude: 32.5600,
  },
  {
    uid: '99999999-9999-4999-8999-999999999999', email: '[email protected]',
    displayName: 'Sporting Goods', storeName: 'Sporting Goods',
    description: 'Fitness, football, basketball, and outdoor equipment.',
    phone: '+256700000010', latitude: 0.3200, longitude: 32.6000,
  },
  {
    uid: '11111111-1111-4111-8111-111111111112', email: '[email protected]',
    displayName: 'Fashion House', storeName: 'African Fashion House',
    description: 'Ankara, kitenge, modern African wear. Made in Uganda.',
    phone: '+256700000002', latitude: 0.3400, longitude: 32.5700,
  },
];

const PRODUCTS = [
  // TechHub Uganda - Electronics
  { seller: '22222222-2222-4222-8222-222222222221', title: 'iPhone 15 Pro 256GB Natural Titanium', desc: 'Brand new sealed, 1-year Apple warranty. Free delivery in Kampala.', price: 450000000, cat: 'Electronics', stock: 5, img: 'https://images.unsplash.com/photo-1592286927505-1def25115558?w=800' },
  { seller: '22222222-2222-4222-8222-222222222221', title: 'Samsung Galaxy S24 Ultra 512GB', desc: 'Authentic, sealed, original S-Pen. 12-month warranty.', price: 380000000, cat: 'Electronics', stock: 8, img: 'https://images.unsplash.com/photo-1610792516775-01de03eae630?w=800' },
  { seller: '22222222-2222-4222-8222-222222222221', title: 'MacBook Air M3 13" 16GB/512GB', desc: 'Brand new, Midnight color. AppleCare eligible.', price: 720000000, cat: 'Electronics', stock: 3, img: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800' },
  { seller: '22222222-2222-4222-8222-222222222221', title: 'Sony WH-1000XM5 Wireless Headphones', desc: 'Industry-leading noise cancellation. 30-hour battery.', price: 165000000, cat: 'Electronics', stock: 12, img: 'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=800' },

  // SneakerKing - Footwear
  { seller: '22222222-2222-4222-8222-222222222222', title: 'Nike Air Jordan 1 Retro High Chicago', desc: 'OG colorway, new release. Comes with original box.', price: 95000000, cat: 'Footwear', stock: 4, img: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800' },
  { seller: '22222222-2222-4222-8222-222222222222', title: 'Adidas Yeezy Boost 350 V2', desc: 'Authentic, deadstock condition. All sizes available.', price: 145000000, cat: 'Footwear', stock: 6, img: 'https://images.unsplash.com/photo-1600185365926-3a2ce3cdb9eb?w=800' },
  { seller: '22222222-2222-4222-8222-222222222222', title: 'Nike Air Force 1 Low White', desc: 'Classic all-white. Sizes 39-45. Available in stock.', price: 45000000, cat: 'Footwear', stock: 20, img: 'https://images.unsplash.com/photo-1600269452121-4f2416e55c28?w=800' },
  { seller: '22222222-2222-4222-8222-222222222222', title: 'New Balance 990v5 Made in USA', desc: 'Premium suede and mesh. Classic grey colorway.', price: 95000000, cat: 'Footwear', stock: 8, img: 'https://images.unsplash.com/photo-1539185441755-769473a23570?w=800' },

  // Glamour - Beauty
  { seller: '22222222-2222-4222-8222-222222222223', title: 'MAC Ruby Woo Lipstick', desc: 'Iconic matte red. Original, sealed, long-lasting formula.', price: 9500000, cat: 'Beauty', stock: 30, img: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=800' },
  { seller: '22222222-2222-4222-8222-222222222223', title: 'NARS Radiance Primer 30ml', desc: 'Glow-boosting primer for radiant skin. Authentic.', price: 13500000, cat: 'Beauty', stock: 18, img: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800' },
  { seller: '22222222-2222-4222-8222-222222222223', title: 'Shea Butter 250g - Pure Organic', desc: 'Unrefined, raw shea butter from Northern Uganda. Multi-purpose.', price: 7000000, cat: 'Beauty', stock: 50, img: 'https://images.unsplash.com/photo-1607006344380-b6775a0824a7?w=800' },
  { seller: '22222222-2222-4222-8222-222222222223', title: 'Charlotte Tilbury Pillow Talk Lipstick', desc: 'Iconic nude-pink. Original, sealed. Limited stock.', price: 15500000, cat: 'Beauty', stock: 12, img: 'https://images.unsplash.com/photo-1522335789203-a46c1e83e45e?w=800' },

  // Home Appliances - Home
  { seller: '11111111-1111-4111-8111-111111111111', title: 'Samsung 55" 4K Smart TV', desc: 'Crystal UHD, Tizen OS, 3-year warranty. Free wall mount.', price: 280000000, cat: 'Home', stock: 6, img: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=800' },
  { seller: '11111111-1111-4111-8111-111111111111', title: 'LG 9kg Front Load Washing Machine', desc: 'Inverter Direct Drive, 10-year motor warranty. Free delivery.', price: 320000000, cat: 'Home', stock: 4, img: 'https://images.unsplash.com/photo-1620664011451-9b0e1c1ce0f4?w=800' },
  { seller: '11111111-1111-4111-8111-111111111111', title: 'Hisense 350L Refrigerator', desc: 'Double door, frost-free, energy efficient. Silver finish.', price: 245000000, cat: 'Home', stock: 7, img: 'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=800' },
  { seller: '11111111-1111-4111-8111-111111111111', title: 'Ninja 4-in-1 Air Fryer', desc: 'Multi-cooker, 7.5L capacity. Healthy cooking, easy clean.', price: 78000000, cat: 'Home', stock: 15, img: 'https://images.unsplash.com/photo-1626509653291-18d9d9b1e96b?w=800' },

  // Sporting Goods - Sports
  { seller: '99999999-9999-4999-8999-999999999999', title: 'Adidas Predator Football Boots', desc: 'Firm ground, size 42. Professional grade.', price: 65000000, cat: 'Sports', stock: 10, img: 'https://images.unsplash.com/photo-1551958219-acbc608c6367?w=800' },
  { seller: '99999999-9999-4999-8999-999999999999', title: 'Nike Basketball Official Size 7', desc: 'Indoor/outdoor composite leather. Premium grip.', price: 18500000, cat: 'Sports', stock: 25, img: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800' },
  { seller: '99999999-9999-4999-8999-999999999999', title: 'Adjustable Dumbbell Set 40kg', desc: 'Quick-change weights, ergonomic grip. Home gym ready.', price: 145000000, cat: 'Sports', stock: 8, img: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800' },
  { seller: '99999999-9999-4999-8999-999999999999', title: 'Yoga Mat Premium 6mm Thick', desc: 'Non-slip, eco-friendly rubber. Includes carrying strap.', price: 12500000, cat: 'Sports', stock: 30, img: 'https://images.unsplash.com/photo-1545205597-3d9d02c2958b?w=800' },

  // Fashion House - Fashion
  { seller: '11111111-1111-4111-8111-111111111112', title: 'Ankara Maxi Dress - Royal Blue', desc: 'Handmade, free-size. Premium wax fabric. Elegant evening wear.', price: 35000000, cat: 'Fashion', stock: 12, img: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=800' },
  { seller: '11111111-1111-4111-8111-111111111112', title: 'Kitenge Blazer - Multi-color', desc: 'Tailored fit, modern African professional wear. Limited edition.', price: 55000000, cat: 'Fashion', stock: 8, img: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=800' },
  { seller: '11111111-1111-4111-8111-111111111112', title: 'Bark Cloth Tote Bag', desc: 'Handcrafted by local artisans. Eco-friendly, unique texture.', price: 18000000, cat: 'Fashion', stock: 20, img: 'https://images.unsplash.com/photo-1591561954557-26941169b49e?w=800' },
  { seller: '11111111-1111-4111-8111-111111111112', title: 'African Print Headwrap Set', desc: 'Set of 3 matching headwraps. Premium kitenge. Versatile styling.', price: 12000000, cat: 'Fashion', stock: 35, img: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=800' },
];

async function wipe() {
  console.log('Wiping products + related rows...');
  try { await pool.query(`DELETE FROM cart_items`); } catch (e) {}
  try { await pool.query(`DELETE FROM saved_products`); } catch (e) {}
  try { await pool.query(`DELETE FROM product_returns`); } catch (e) {}
  try { await pool.query(`DELETE FROM receipts`); } catch (e) {}
  try { await pool.query(`DELETE FROM transaction_agreements`); } catch (e) {}
  try { await pool.query(`DELETE FROM products`); } catch (e) {}
  console.log('  products table cleared.');
}

async function upsertSellers() {
  console.log('\nUpserting 6 sellers...');
  for (const s of SELLERS) {
    await pool.query(
      `UPDATE users SET
         display_name = $1,
         last_known_lat = $2,
         last_known_lng = $3,
         language = 'en',
         currency = 'UGX',
         is_active = true
       WHERE id = $4`,
      [s.displayName, s.latitude, s.longitude, s.uid],
    );
    await pool.query(
      `INSERT INTO seller_profiles (user_id, business_name, market_name, business_description, seller_trust_score, lat, lng, address)
         VALUES ($1, $2, $2, $3, 4.5, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET
         business_name = EXCLUDED.business_name,
         market_name = EXCLUDED.market_name,
         business_description = EXCLUDED.business_description,
         lat = EXCLUDED.lat,
         lng = EXCLUDED.lng,
         address = EXCLUDED.address`,
      [s.uid, s.storeName, s.description, s.latitude, s.longitude, s.locationLabel],
    );
    // Ensure user is seller role
    await pool.query(`UPDATE users SET role = 'seller' WHERE id = $1`, [s.uid]);
    console.log(`  OK: ${s.storeName}`);
  }
}

async function createProducts() {
  console.log('\nInserting 24 products...');
  let n = 0;
  for (const p of PRODUCTS) {
    await pool.query(
      `INSERT INTO products (seller_id, title, description, price_minor, currency, stock_quantity, category, image_url, image_url_signed, is_active, product_trust_score)
         VALUES ($1, $2, $3, $4, 'UGX', $5, $6, $7, $7, true, 4.5)`,
      [p.seller, p.title, p.desc, p.price, p.stock, p.cat, p.img],
    );
    n++;
    console.log(`  ${n}. ${p.title} (${p.cat})`);
  }
  console.log(`\n  ${n} products created.`);
}

async function updateBuyer() {
  console.log('\nUpdating existing test buyer...');
  await pool.query(
    `UPDATE users SET display_name = 'Alex Tumwine', language = 'en', currency = 'UGX'
       WHERE email = '[email protected]'`,
  );
  console.log('  OK: [email protected] -> Alex Tumwine');
}

async function main() {
  await wipe();
  await upsertSellers();
  await createProducts();
  await updateBuyer();
  console.log('\nSUCCESS: 6 sellers, 24 products, 1 buyer updated.');
  await pool.end();
}

main().catch((err) => { console.error('FAIL:', err); process.exit(1); });
