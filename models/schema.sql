-- ============================================================
-- Ershaye (እርሻዬ) — Ethiopian fresh produce online shop
-- PostgreSQL / Neon schema (mirrors server/config/db.js initDB)
-- ============================================================

-- 1. Admins (shop operators)
CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) DEFAULT 'superadmin',   -- admin | superadmin
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Product categories (bilingual)
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,               -- slug, e.g. 'leafy-greens'
    name_en TEXT NOT NULL,
    name_am TEXT NOT NULL,
    description_en TEXT,
    description_am TEXT,
    image TEXT,
    sort_order INTEGER DEFAULT 0
);

-- 3. Products (bilingual, prices in ETB)
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name_en TEXT NOT NULL,
    name_am TEXT NOT NULL,
    slug TEXT UNIQUE,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    price NUMERIC(10,2) NOT NULL DEFAULT 0,
    unit TEXT DEFAULT 'bunch',               -- bunch | kg | box | piece
    unit_am TEXT DEFAULT 'እሽግ',
    stock INTEGER DEFAULT 0,
    image TEXT,                              -- Cloudinary URL
    images TEXT[],
    short_en TEXT,
    short_am TEXT,
    description_en TEXT,
    description_am TEXT,
    featured BOOLEAN DEFAULT FALSE,
    available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Orders (COD or bank transfer with receipt)
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    ref TEXT UNIQUE NOT NULL,                -- e.g. ER-2026-1042
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    city TEXT NOT NULL,
    address TEXT NOT NULL,
    note TEXT,
    payment_method VARCHAR(20) NOT NULL,     -- cod | bank_transfer
    receipt_image TEXT,                      -- Cloudinary URL of bank receipt
    subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
    delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
    total NUMERIC(10,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',    -- pending | confirmed | delivered | cancelled
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. Order line items
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name_en TEXT,
    product_name_am TEXT,
    unit TEXT,
    price NUMERIC(10,2) NOT NULL,
    quantity INTEGER NOT NULL
);

-- 6. Blog posts (bilingual)
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

-- 7. Contact messages / inbox
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    sender_name TEXT NOT NULL,
    sender_email TEXT NOT NULL,
    subject TEXT,
    content TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'unread',     -- unread | read | replied
    reply_content TEXT,
    replied_at TIMESTAMPTZ,
    replied_by TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8. Settings (shop_open, delivery_fee, ...)
CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO settings (key, value)
VALUES ('shop_open', 'true'), ('delivery_fee', '150')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- Indexes for common query patterns
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products (featured) WHERE featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_orders_status       ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at   ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order   ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at    ON posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_status     ON messages (status);
