import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DB,
  ssl: { rejectUnauthorized: false },
});

pool.on("error", (err) => console.error("❌ DB Client Error:", err));

export const initDB = async () => {
  try {
    await pool.query(`
      -- ============================================================
      -- Evergreen Ethiopia — Ethiopian fresh produce online shop
      -- ============================================================

      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role VARCHAR(20) DEFAULT 'superadmin',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,          -- slug, e.g. 'leafy-greens'
        name_en TEXT NOT NULL,
        name_am TEXT NOT NULL,
        description_en TEXT,
        description_am TEXT,
        image TEXT,
        sort_order INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name_en TEXT NOT NULL,
        name_am TEXT NOT NULL,
        slug TEXT UNIQUE,
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        price NUMERIC(10,2) NOT NULL DEFAULT 0,
        unit TEXT DEFAULT 'bunch',          -- bunch | kg | box | piece
        unit_am TEXT DEFAULT 'እሽግ',
        stock INTEGER DEFAULT 0,
        image TEXT,
        images TEXT[],
        short_en TEXT,
        short_am TEXT,
        description_en TEXT,
        description_am TEXT,
        featured BOOLEAN DEFAULT FALSE,
        available BOOLEAN DEFAULT TRUE,
        meta JSONB DEFAULT '{}'::jsonb,     -- category-specific fields (brand, format, pages, ...)
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      -- Add meta to existing installs (idempotent)
      ALTER TABLE products ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}'::jsonb;

      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        ref TEXT UNIQUE NOT NULL,           -- e.g. ER-2026-1042
        customer_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        city TEXT NOT NULL,
        address TEXT NOT NULL,
        note TEXT,
        payment_method VARCHAR(20) NOT NULL, -- cod | bank_transfer
        receipt_image TEXT,                  -- Cloudinary URL of bank receipt
        subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
        delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
        total NUMERIC(10,2) NOT NULL DEFAULT 0,
        status VARCHAR(20) DEFAULT 'pending', -- pending | confirmed | delivered | cancelled
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        product_name_en TEXT,
        product_name_am TEXT,
        unit TEXT,
        price NUMERIC(10,2) NOT NULL,
        quantity INTEGER NOT NULL,
        -- Secure one-time eBook download (token issued on admin confirmation)
        download_token TEXT UNIQUE,
        downloaded_at TIMESTAMPTZ,
        downloads INTEGER DEFAULT 0
      );

      -- Add one-time download columns to existing installs (idempotent)
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS download_token TEXT UNIQUE;
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS downloaded_at TIMESTAMPTZ;
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS downloads INTEGER DEFAULT 0;

      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        title_en TEXT NOT NULL,
        title_am TEXT NOT NULL,
        content_en TEXT NOT NULL,
        content_am TEXT NOT NULL,
        author TEXT NOT NULL,
        category TEXT,
        image TEXT,
        published BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender_name TEXT NOT NULL,
        sender_email TEXT NOT NULL,
        subject TEXT,
        content TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'unread',  -- unread | read | replied
        reply_content TEXT,
        replied_at TIMESTAMPTZ,
        replied_by TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO settings (key, value)
      VALUES
        ('shop_open', 'true'),
        ('delivery_fee', '150'),
        ('business_name', 'Evergreen Ethiopia PLC'),
        ('business_phone', '+251 951 469565'),
        ('business_phone_alt', '+251 940 124409'),
        ('business_email', 'hello@evergreenethiopia.et'),
        ('business_address', 'Addis Ababa, Ethiopia'),
        ('telegram_url', 'https://t.me/evergreenethiopia'),
        ('instagram_url', 'https://www.instagram.com/evergreenethiopia'),
        ('facebook_url', 'https://www.facebook.com/evergreenethiopia'),
        ('bank_name', 'Commercial Bank of Ethiopia (CBE)'),
        ('bank_account', '1000 1847 2659 3312'),
        ('bank_holder', 'Evergreen Ethiopia PLC')
      ON CONFLICT (key) DO NOTHING;
    `);

    console.log("✅ Evergreen Ethiopia database initialized successfully.");
  } catch (err) {
    console.error("❌ DB Init Error:", err);
    throw err;
  }
};

export default pool;
