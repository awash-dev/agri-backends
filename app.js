import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import pg from "pg";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { createServer } from "http";
import { Server } from "socket.io";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";
import nodemailer from "nodemailer";

dotenv.config();

import pool, { initDB } from "./config/db.js";
import { randomBytes } from "crypto";
import { verifyToken, verifyAdmin, verifySuperAdmin } from "./middleware/auth.js";

const app = express();
const server = createServer(app);

// CORS: allow the production frontend plus the common local dev origins.
const defaultAllowedOrigins = [
  "http://localhost:5173",
  "http://localhost:4173",
  "https://everygreen.greenafricafarm.com",
  "https://www.everygreen.greenafricafarm.com",
];
const configuredOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const allowedOrigins = [...new Set([...defaultAllowedOrigins, ...configuredOrigins])];

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error("Origin not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 204,
  preflightContinue: false,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const io = new Server(server, { cors: corsOptions });

io.on("connection", (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);
  socket.on("disconnect", () => console.log(`🔌 Socket disconnected: ${socket.id}`));
});

const notifyClients = (event, data) => {
  io.emit(event, { ...data, timestamp: new Date().toISOString() });
};

// ─── Cloudinary (product images + bank receipts) ─────────────────
if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

const imageStorage = new CloudinaryStorage({
  cloudinary,
  params: async () => ({
    folder: "ershaye/products",
    allowed_formats: ["jpg", "png", "jpeg", "gif", "webp"],
    transformation: [{ width: 1400, height: 1400, crop: "limit", quality: "auto" }],
  }),
});
const uploadImage = multer({ storage: imageStorage, limits: { fileSize: 10 * 1024 * 1024 } });

const receiptStorage = new CloudinaryStorage({
  cloudinary,
  params: async () => ({
    folder: "ershaye/receipts",
    allowed_formats: ["jpg", "png", "jpeg", "webp", "pdf"],
  }),
});
const uploadReceipt = multer({ storage: receiptStorage, limits: { fileSize: 10 * 1024 * 1024 } });

// eBook PDFs — free Cloudinary storage (raw files), no extra setup needed.
const ebookStorage = new CloudinaryStorage({
  cloudinary,
  params: async () => ({
    folder: "ershaye/ebooks",
    resource_type: "raw",
    allowed_formats: ["pdf"],
  }),
});
const uploadPdf = multer({ storage: ebookStorage, limits: { fileSize: 25 * 1024 * 1024 } });

// ─── SMTP (optional — only used when configured) ─────────────────
const transporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      tls: { rejectUnauthorized: false },
    })
  : null;

const sendMailSafe = async (opts) => {
  if (!transporter) return;
  try {
    await transporter.sendMail(opts);
    console.log("📧 Email sent:", opts.subject);
  } catch (err) {
    console.error("❌ Email Error:", err.message);
  }
};

/** Escape user content for safe inclusion in HTML emails. */
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** The business mailbox — receives admin notifications. */
const adminMailbox = () => process.env.SMTP_USER || "hello@evergreenethiopia.et";

// ─── Helpers ─────────────────────────────────────────────────────
const genOrderRef = () => {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ER-${year}-${rand}`;
};

const toSlug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/** Normalize the optional `meta` field (object or JSON string) to an object. */
const toMeta = (m) => {
  if (!m) return {};
  if (typeof m === "string") {
    try {
      return JSON.parse(m);
    } catch {
      return {};
    }
  }
  return m;
};

// ============================================================
// HEALTH / SETTINGS
// ============================================================
app.get("/", (req, res) => {
  res.json({ success: true, name: "Evergreen Ethiopia API", status: "running", message: "Server is running." });
});

app.get("/api/health", (req, res) => {
  res.json({ success: true, name: "Evergreen Ethiopia API", status: "running" });
});

app.get("/api/settings", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT key, value FROM settings");
    const settings = rows.reduce((acc, r) => ({ ...acc, [r.key]: r.value }), {});
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

app.patch("/api/settings", verifyAdmin, async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key || value === undefined) return res.status(400).json({ error: "Key and value required" });
    const { rows } = await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [key, String(value)],
    );
    notifyClients("settings_updated", { key, value });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// ============================================================
// UPLOADS
// ============================================================
// Upload an eBook PDF (admin) — returns the public URL to store in meta.file_url.
app.post("/api/uploads/pdf", verifyAdmin, uploadPdf.single("file"), async (req, res) => {
  if (!req.file?.path) return res.status(400).json({ error: "No PDF file provided" });
  res.json({ url: req.file.path });
});

// ============================================================
// AUTH (admin only — the shop itself has no customer accounts)
// ============================================================
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  try {
    const { rows } = await pool.query("SELECT * FROM admins WHERE email = $1", [
      email.trim().toLowerCase(),
    ]);
    const admin = rows[0];
    if (!admin) return res.status(401).json({ error: "Invalid credentials" });

    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: admin.role },
      process.env.JWT_SECRET || "evergreen_secret_key_2026",
      { expiresIn: "8h" },
    );

    res.json({ token, user: { email: admin.email, role: admin.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// CATEGORIES
// ============================================================
app.get("/api/categories", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM categories ORDER BY sort_order ASC, id ASC",
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

app.post("/api/categories", verifyAdmin, async (req, res) => {
  try {
    const { name, name_en, name_am, description_en, description_am, image, sort_order } = req.body;
    if (!name || !name_en || !name_am) return res.status(400).json({ error: "name, name_en, name_am required" });
    const { rows } = await pool.query(
      `INSERT INTO categories (name, name_en, name_am, description_en, description_am, image, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, name_en, name_am, description_en, description_am, image, sort_order || 0],
    );
    notifyClients("category_added", rows[0]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(400).json({ error: "Category slug already exists" });
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/categories/:id", verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, name_en, name_am, description_en, description_am, image, sort_order } = req.body;
    const { rows } = await pool.query(
      `UPDATE categories SET name=$1, name_en=$2, name_am=$3, description_en=$4,
       description_am=$5, image=COALESCE($6, image), sort_order=$7 WHERE id=$8 RETURNING *`,
      [name, name_en, name_am, description_en, description_am, image, sort_order || 0, id],
    );
    if (rows.length === 0) return res.status(404).json({ error: "Category not found" });
    notifyClients("category_updated", rows[0]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/categories/:id", verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query("DELETE FROM categories WHERE id=$1 RETURNING id", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Category not found" });
    notifyClients("category_deleted", { id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PRODUCTS (public read, admin write)
// ============================================================
app.get("/api/products", async (req, res) => {
  try {
    const { category, search, featured, sort } = req.query;
    const params = [];
    let where = [];
    let idx = 1;

    if (category) {
      where.push(`c.name = $${idx++}`);
      params.push(category);
    }
    if (search) {
      where.push(`(p.name_en ILIKE $${idx} OR p.name_am ILIKE $${idx} OR p.short_en ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    if (featured === "true") where.push("p.featured = TRUE");
    where.push("p.available = TRUE");

    const orderBy =
      sort === "price_asc" ? "p.price ASC"
      : sort === "price_desc" ? "p.price DESC"
      : sort === "newest" ? "p.created_at DESC"
      : "p.name_en ASC";

    const query = `SELECT p.*, c.name AS category, c.name_en AS category_en, c.name_am AS category_am
      FROM products p LEFT JOIN categories c ON c.id = p.category_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY ${orderBy}`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

app.get("/api/products/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const { rows } = await pool.query(
      `SELECT p.*, c.name AS category, c.name_en AS category_en, c.name_am AS category_am
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.slug = $1 OR p.id::text = $1`,
      [slug],
    );
    if (rows.length === 0) return res.status(404).json({ error: "Product not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

app.post("/api/products", verifyAdmin, uploadImage.single("image"), async (req, res) => {
  try {
    const {
      name_en, name_am, category_id, price, unit, unit_am, stock,
      short_en, short_am, description_en, description_am, featured, available, meta,
    } = req.body;
    if (!name_en || !name_am || !price) return res.status(400).json({ error: "name_en, name_am, price required" });

    const image = req.file?.path || req.body.image || null;
    const slug = toSlug(name_en) + "-" + Date.now().toString(36).slice(-4);
    const metaJson = toMeta(meta);

    const { rows } = await pool.query(
      `INSERT INTO products (name_en, name_am, slug, category_id, price, unit, unit_am, stock,
         image, short_en, short_am, description_en, description_am, featured, available, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *`,
      [name_en, name_am, slug, category_id || null, price, unit || "bunch", unit_am || "እሽግ",
        stock || 0, image, short_en, short_am, description_en, description_am,
        featured === "true" || featured === true, available !== "false" && available !== false, metaJson],
    );
    notifyClients("product_added", rows[0]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to add product: " + err.message });
  }
});

app.put("/api/products/:id", verifyAdmin, uploadImage.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    const current = await pool.query("SELECT image FROM products WHERE id=$1", [id]);
    if (current.rows.length === 0) return res.status(404).json({ error: "Product not found" });

    const {
      name_en, name_am, category_id, price, unit, unit_am, stock,
      short_en, short_am, description_en, description_am, featured, available, meta,
    } = req.body;
    const image = req.file?.path || req.body.image || current.rows[0].image;
    const metaJson = toMeta(meta);

    const { rows } = await pool.query(
      `UPDATE products SET name_en=$1, name_am=$2, category_id=$3, price=$4, unit=$5, unit_am=$6,
         stock=$7, image=$8, short_en=$9, short_am=$10, description_en=$11, description_am=$12,
         featured=$13, available=$14, meta=$15 WHERE id=$16 RETURNING *`,
      [name_en, name_am, category_id || null, price, unit || "bunch", unit_am || "እሽግ",
        stock || 0, image, short_en, short_am, description_en, description_am,
        featured === "true" || featured === true, available !== "false" && available !== false, metaJson, id],
    );
    notifyClients("product_updated", rows[0]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to update product: " + err.message });
  }
});

app.delete("/api/products/:id", verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query("DELETE FROM products WHERE id=$1 RETURNING id", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Product not found" });
    notifyClients("product_deleted", { id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ORDERS
// ============================================================
const deliveryFee = async () => {
  try {
    const { rows } = await pool.query("SELECT value FROM settings WHERE key='delivery_fee'");
    return parseFloat(rows[0]?.value) || 0;
  } catch {
    return 0;
  }
};

// Create order (public)
app.post("/api/orders", async (req, res) => {
  const { customer_name, phone, email, city, address, note, payment_method, items } = req.body;

  if (!customer_name || !phone || !city || !address || !items || items.length === 0) {
    return res.status(400).json({ error: "Customer details and at least one item are required" });
  }
  if (!["cod", "bank_transfer"].includes(payment_method)) {
    return res.status(400).json({ error: "Payment method must be 'cod' or 'bank_transfer'" });
  }

  const client = await pool.connect();
  try {
    const productIds = items.map((i) => parseInt(i.product_id));
    const { rows: products } = await pool.query(
      `SELECT p.*, c.name AS category
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = ANY($1)`,
      [productIds],
    );
    const productMap = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    const orderItems = items.map((it) => {
      const p = productMap.get(parseInt(it.product_id));
      if (!p) throw new Error(`Product #${it.product_id} not found`);
      const qty = Math.max(1, parseInt(it.quantity) || 1);
      subtotal += parseFloat(p.price) * qty;
      return {
        product_id: p.id,
        name_en: p.name_en,
        name_am: p.name_am,
        unit: p.unit,
        price: p.price,
        quantity: qty,
        is_ebook: p.category === "ebooks",
      };
    });

    // eBooks are delivered by secure download — bank transfer + receipt only.
    if (orderItems.some((oi) => oi.is_ebook) && payment_method !== "bank_transfer") {
      return res
        .status(400)
        .json({ error: "eBooks can only be paid by bank transfer — please upload a payment receipt" });
    }

    const fee = await deliveryFee();
    const total = subtotal + fee;

    await client.query("BEGIN");

    const ref = genOrderRef();
    const { rows: orderRows } = await client.query(
      `INSERT INTO orders (ref, customer_name, phone, email, city, address, note, payment_method, subtotal, delivery_fee, total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [ref, customer_name, phone, email, city, address, note, payment_method, subtotal.toFixed(2), fee, total.toFixed(2)],
    );
    const order = orderRows[0];

    for (const oi of orderItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name_en, product_name_am, unit, price, quantity)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [order.id, oi.product_id, oi.name_en, oi.name_am, oi.unit, oi.price, oi.quantity],
      );
    }

    await client.query("COMMIT");

    notifyClients("new_order", { id: order.id, ref: order.ref, customer: order.customer_name, total: order.total });

    const itemsHtml = orderItems
      .map((oi) => `<tr><td>${esc(oi.name_en)}</td><td>${oi.quantity}×</td><td>${oi.price} ETB</td><td>${oi.price * oi.quantity} ETB</td></tr>`)
      .join("");

    // Customer confirmation
    sendMailSafe({
      from: `"Evergreen Ethiopia" <${process.env.SMTP_USER || "orders@evergreenethiopia.et"}>`,
      to: email || (process.env.SMTP_USER ? process.env.SMTP_USER : undefined),
      subject: `Order Confirmation ${ref} — Evergreen Ethiopia`,
      html: `<h2>መልካም ምርጫ! Your order ${ref} is confirmed.</h2>
        <p>Thank you, <strong>${esc(customer_name)}</strong>. Total: <strong>${total} ETB</strong> (${payment_method === "cod" ? "Cash on delivery" : "Bank transfer"}).</p>
        <table border="1" cellpadding="8" style="border-collapse:collapse;margin-top:12px"><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>${itemsHtml}</table>
        <p style="color:#666;font-size:12px">Track it: <a href="${process.env.APP_URL || "http://localhost:5173"}/order-success?ref=${ref}">${process.env.APP_URL || "http://localhost:5173"}/order-success?ref=${ref}</a></p>`,
    }).catch(() => {});

    // Admin notification with full order details
    sendMailSafe({
      from: `"Evergreen Ethiopia Orders" <${process.env.SMTP_USER || "orders@evergreenethiopia.et"}>`,
      to: adminMailbox(),
      subject: `🛒 New order ${ref} — ${total} ETB`,
      html: `<h2>New order received</h2>
        <p><strong>${esc(customer_name)}</strong> · ${esc(phone)}${email ? " · " + esc(email) : ""}</p>
        <p>${esc(city)} — ${esc(address)}</p>
        <p>Payment: <strong>${payment_method === "cod" ? "Cash on delivery" : "Bank transfer"}</strong>${payment_method === "bank_transfer" ? " — verify the receipt in the dashboard" : ""}</p>
        <table border="1" cellpadding="8" style="border-collapse:collapse;margin-top:12px"><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>${itemsHtml}<tr><td colspan="3" align="right"><strong>Total</strong></td><td><strong>${total} ETB</strong></td></tr></table>`,
    }).catch(() => {});

    res.status(201).json(order);
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Failed to create order: " + err.message });
  } finally {
    client.release();
  }
});

// Upload bank-transfer receipt (public, by ref)
// Accepts either multipart file ("receipt") or JSON base64 ("receipt").
app.post("/api/orders/:ref/payment-receipt", uploadReceipt.single("receipt"), async (req, res) => {
  try {
    const { ref } = req.params;
    const { rows } = await pool.query("SELECT * FROM orders WHERE ref = $1", [ref]);
    if (rows.length === 0) return res.status(404).json({ error: "Order not found" });

    const receipt = req.file?.path || req.body?.receipt || null;
    if (!receipt) return res.status(400).json({ error: "No receipt image provided" });

    const { rows: updated } = await pool.query(
      "UPDATE orders SET receipt_image=$1 WHERE ref=$2 RETURNING *",
      [receipt, ref],
    );
    notifyClients("order_receipt_uploaded", { id: updated[0].id, ref });
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to upload receipt" });
  }
});

// Public order tracking
app.get("/api/orders/track", async (req, res) => {
  try {
    const { ref, phone } = req.query;
    if (!ref) return res.status(400).json({ error: "Order reference required" });
    const { rows } = await pool.query("SELECT * FROM orders WHERE ref = $1", [ref]);
    if (rows.length === 0) return res.status(404).json({ error: "Order not found" });

    const order = rows[0];
    if (phone && order.phone !== phone) return res.status(403).json({ error: "Phone does not match this order" });

    const items = await pool.query(
      `SELECT oi.*, c.name AS category
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE oi.order_id = $1`,
      [order.id],
    );
    // eBook download links appear once the order is confirmed — protected by
    // the secret one-time token (and a wrong phone still blocks tracking).
    const tracked = items.rows.map((it) => {
      const isEbook = it.category === "ebooks";
      if (!isEbook) return it;
      return {
        ...it,
        is_ebook: true,
        downloaded: !!it.downloaded_at,
        download_url:
          it.download_token && !it.downloaded_at && ["confirmed", "delivered"].includes(order.status)
            ? `/api/orders/${order.id}/ebook/${it.id}/download?token=${it.download_token}`
            : null,
      };
    });
    res.json({ ...order, items: tracked });
  } catch (err) {
    res.status(500).json({ error: "Failed to track order" });
  }
});

// Secure one-time eBook download — streams the PDF through the server so the
// raw storage URL stays hidden. Valid only after admin confirmation.
app.get("/api/orders/:orderId/ebook/:itemId/download", async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: "Download token required" });

    const { rows } = await pool.query(
      `SELECT oi.id, oi.download_token, oi.downloaded_at, oi.downloads, oi.product_name_en,
              o.status AS order_status, p.meta
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN products p ON p.id = oi.product_id
       WHERE oi.id = $1 AND oi.order_id = $2`,
      [itemId, orderId],
    );
    const item = rows[0];
    if (!item) return res.status(404).json({ error: "Download not found" });
    if (!["confirmed", "delivered"].includes(item.order_status)) {
      return res.status(403).json({ error: "Your order is not confirmed yet — download unlocks after admin approval" });
    }
    if (!item.download_token || item.download_token !== token) {
      return res.status(403).json({ error: "Invalid download token" });
    }
    if (item.downloaded_at) {
      return res.status(403).json({ error: "This eBook has already been downloaded" });
    }

    const fileUrl = item.meta?.file_url;
    if (!fileUrl) return res.status(404).json({ error: "No file attached to this eBook yet" });

    // Mark as used FIRST so a concurrent request cannot double-download.
    await pool.query("UPDATE order_items SET downloaded_at = NOW(), downloads = COALESCE(downloads, 0) + 1 WHERE id = $1", [itemId]);

    try {
      const upstream = await fetch(fileUrl);
      if (!upstream.ok) throw new Error(`Storage returned ${upstream.status}`);
      const filename = (item.product_name_en || "ebook").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".pdf";
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (err) {
      // Streaming failed — restore the download for a retry.
      await pool.query("UPDATE order_items SET downloaded_at = NULL WHERE id = $1", [itemId]);
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: "Failed to download: " + err.message });
  }
});

// Admin: list orders (has_ebooks flag tells the dashboard which orders unlock downloads)
app.get("/api/orders", verifyAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const params = [];
    let where = "";
    if (status) {
      where = "WHERE o.status = $1";
      params.push(status);
    }
    const { rows } = await pool.query(
      `SELECT o.*, EXISTS(
         SELECT 1 FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         JOIN categories c ON c.id = p.category_id
         WHERE oi.order_id = o.id AND c.name = 'ebooks'
       ) AS has_ebooks
       FROM orders o ${where}
       ORDER BY o.created_at DESC`,
      params,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// Admin: single order with items (eBook items include the download link/key)
app.get("/api/orders/:id", verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query("SELECT * FROM orders WHERE id = $1", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Order not found" });
    const order = rows[0];
    const items = await pool.query(
      `SELECT oi.*, c.name AS category
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE oi.order_id = $1`,
      [id],
    );
    const enriched = items.rows.map((it) => ({
      ...it,
      is_ebook: it.category === "ebooks",
      downloaded: !!it.downloaded_at,
      download_url:
        it.category === "ebooks" && it.download_token && !it.downloaded_at &&
        ["confirmed", "delivered"].includes(order.status)
          ? `/api/orders/${id}/ebook/${it.id}/download?token=${it.download_token}`
          : null,
    }));
    res.json({ ...order, items: enriched });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

// Admin: update order status
app.patch("/api/orders/:id/status", verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!["pending", "confirmed", "delivered", "cancelled"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const { rows } = await pool.query(
      "UPDATE orders SET status = $1 WHERE id = $2 RETURNING *",
      [status, id],
    );
    if (rows.length === 0) return res.status(404).json({ error: "Order not found" });
    notifyClients("order_status_updated", { id, status });

    // When confirmed (or delivered), issue one-time download tokens for eBook items.
    if (["confirmed", "delivered"].includes(status)) {
      const { rows: ebookItems } = await pool.query(
        `SELECT oi.id FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         JOIN categories c ON c.id = p.category_id
         WHERE oi.order_id = $1 AND c.name = 'ebooks' AND oi.download_token IS NULL`,
        [id],
      );
      for (const it of ebookItems) {
        await pool.query("UPDATE order_items SET download_token = $1 WHERE id = $2", [
          randomBytes(32).toString("hex"),
          it.id,
        ]);
      }
    }

    // Notify the customer by email about their order's new status.
    const updated = rows[0];
    const statusLabels = {
      confirmed: "✅ Confirmed",
      delivered: "🚚 Delivered",
      cancelled: "❌ Cancelled",
      pending: "⏳ Pending",
    };
    if (updated.email) {
      sendMailSafe({
        from: `"Evergreen Ethiopia" <${process.env.SMTP_USER || "orders@evergreenethiopia.et"}>`,
        to: updated.email,
        subject: `Order ${updated.ref} — ${statusLabels[status] || status}`,
        html: `<h2>Your order ${updated.ref} is now <strong>${statusLabels[status] || status}</strong></h2>
          <p>Hi <strong>${esc(updated.customer_name)}</strong>, your order total is <strong>${updated.total} ETB</strong>.</p>
          <p style="color:#666;font-size:12px">Track it: <a href="${process.env.APP_URL || "http://localhost:5173"}/order-success?ref=${updated.ref}">${process.env.APP_URL || "http://localhost:5173"}/order-success?ref=${updated.ref}</a></p>`,
      }).catch(() => {});
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to update order status" });
  }
});

// ============================================================
// POSTS / BLOG
// ============================================================
app.get("/api/posts", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM posts WHERE published = TRUE ORDER BY created_at DESC",
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

app.get("/api/posts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query("SELECT * FROM posts WHERE id = $1", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Post not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch post" });
  }
});

app.post("/api/posts", verifyAdmin, uploadImage.single("image"), async (req, res) => {
  try {
    const { title_en, title_am, content_en, content_am, author, category, published } = req.body;
    if (!title_en || !title_am || !content_en) return res.status(400).json({ error: "title_en, title_am, content_en required" });
    const image = req.file?.path || req.body.image || null;
    const { rows } = await pool.query(
      `INSERT INTO posts (title_en, title_am, content_en, content_am, author, category, image, published)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [title_en, title_am, content_en, content_am || content_en, author || "Evergreen Ethiopia", category || "News",
        image, published !== "false" && published !== false],
    );
    notifyClients("post_added", rows[0]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to add post: " + err.message });
  }
});

app.put("/api/posts/:id", verifyAdmin, uploadImage.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    const current = await pool.query("SELECT image FROM posts WHERE id=$1", [id]);
    if (current.rows.length === 0) return res.status(404).json({ error: "Post not found" });

    const { title_en, title_am, content_en, content_am, author, category, published } = req.body;
    const image = req.file?.path || req.body.image || current.rows[0].image;

    const { rows } = await pool.query(
      `UPDATE posts SET title_en=$1, title_am=$2, content_en=$3, content_am=$4, author=$5,
         category=$6, image=$7, published=$8 WHERE id=$9 RETURNING *`,
      [title_en, title_am, content_en, content_am || content_en, author || "Evergreen Ethiopia", category || "News",
        image, published !== "false" && published !== false, id],
    );
    notifyClients("post_updated", rows[0]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to update post: " + err.message });
  }
});

app.delete("/api/posts/:id", verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query("DELETE FROM posts WHERE id=$1 RETURNING id", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Post not found" });
    notifyClients("post_deleted", { id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// CONTACT / MESSAGES
// ============================================================
app.post("/api/contact", async (req, res) => {
  const { email, name, message, subject } = req.body;
  if (!email || !name || !message)
    return res.status(400).json({ error: "Name, email, message required" });
  try {
    const { rows } = await pool.query(
      `INSERT INTO messages (sender_name, sender_email, subject, content, status)
       VALUES ($1, $2, $3, $4, 'unread') RETURNING *`,
      [name, email.toLowerCase(), subject || "No Subject", message],
    );
    notifyClients("new_message", { id: rows[0].id, sender: rows[0].sender_name, subject: rows[0].subject });

    // Email the message to the business inbox so it's never missed.
    sendMailSafe({
      from: `"Evergreen Ethiopia Contact" <${adminMailbox()}>`,
      to: adminMailbox(),
      subject: `💬 New message from ${rows[0].sender_name} — ${rows[0].subject}`,
      html: `<h2>New message from the Evergreen Ethiopia contact form</h2>
        <p><strong>${esc(rows[0].sender_name)}</strong> &lt;${esc(rows[0].sender_email)}&gt;</p>
        <p><strong>Subject:</strong> ${esc(rows[0].subject)}</p>
        <hr/>
        <p style="white-space:pre-line">${esc(rows[0].content)}</p>
        <hr/>
        <p style="color:#666;font-size:12px">Reply from the dashboard: <a href="${process.env.APP_URL || "http://localhost:5173"}/dashboard/inbox">Open inbox</a></p>`,
    }).catch(() => {});

    res.status(201).json({ success: true, message: "Message sent!", messageId: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/messages/stats", verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT COUNT(*) as count FROM messages WHERE status = 'unread'");
    res.json({ unreadCount: parseInt(rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/messages", verifyAdmin, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    const params = [];
    let where = "";
    if (status) {
      params.push(status);
      where = "WHERE status = $1";
    }
    params.push(parseInt(limit), parseInt(offset));
    const { rows } = await pool.query(
      `SELECT * FROM messages ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/messages/:id", verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query("SELECT * FROM messages WHERE id = $1", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Message not found" });
    const msg = rows[0];
    if (msg.status === "unread") {
      await pool.query("UPDATE messages SET status = 'read' WHERE id = $1", [id]);
      msg.status = "read";
      notifyClients("message_read", { id });
    }
    res.json(msg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/messages/:id/reply", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { replyContent } = req.body;
  if (!replyContent) return res.status(400).json({ error: "Reply content required" });
  try {
    const { rows } = await pool.query(
      "UPDATE messages SET reply_content=$1, replied_at=NOW(), status='replied', replied_by=$2 WHERE id=$3 RETURNING *",
      [replyContent, req.user.email, id],
    );
    if (rows.length === 0) return res.status(404).json({ error: "Message not found" });
    notifyClients("message_updated", { id, status: rows[0].status });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/messages/:id", verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query("DELETE FROM messages WHERE id=$1 RETURNING id", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Message not found" });
    notifyClients("message_deleted", { id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DASHBOARD STATS
// ============================================================
app.get("/api/dashboard/stats", verifyAdmin, async (req, res) => {
  try {
    const [products, orders, pendingOrders, messages, revenue] = await Promise.all([
      pool.query("SELECT COUNT(*)::int as c FROM products"),
      pool.query("SELECT COUNT(*)::int as c FROM orders"),
      pool.query("SELECT COUNT(*)::int as c FROM orders WHERE status = 'pending'"),
      pool.query("SELECT COUNT(*)::int as c FROM messages WHERE status = 'unread'"),
      pool.query("SELECT COALESCE(SUM(total), 0)::float as s FROM orders WHERE status != 'cancelled'"),
    ]);
    res.json({
      products: products.rows[0].c,
      orders: orders.rows[0].c,
      pendingOrders: pendingOrders.rows[0].c,
      unreadMessages: messages.rows[0].c,
      revenue: revenue.rows[0].s,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DASHBOARD ANALYTICS
// ============================================================
app.get("/api/dashboard/analytics", verifyAdmin, async (req, res) => {
  try {
    const [dailyRes, statusRes, topRes, totalsRes] = await Promise.all([
      // Revenue + order count per day for the last 14 days (zero-filled)
      pool.query(`
        SELECT d.day::date AS day, COALESCE(o.orders, 0)::int AS orders, COALESCE(o.revenue, 0)::float AS revenue
        FROM generate_series(CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE, '1 day') AS d(day)
        LEFT JOIN (
          SELECT created_at::date AS day, COUNT(*)::int AS orders, COALESCE(SUM(total), 0)::float AS revenue
          FROM orders WHERE status <> 'cancelled' GROUP BY created_at::date
        ) o ON o.day = d.day
        ORDER BY d.day`),
      // Order counts grouped by status
      pool.query(`SELECT status, COUNT(*)::int AS count FROM orders GROUP BY status`),
      // Top products by quantity sold (excluding cancelled orders)
      pool.query(`
        SELECT oi.product_id, oi.product_name_en AS name, SUM(oi.quantity)::int AS qty,
               SUM(oi.price * oi.quantity)::float AS revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id AND o.status <> 'cancelled'
        GROUP BY oi.product_id, oi.product_name_en
        ORDER BY qty DESC LIMIT 6`),
      // Totals for the last 14 days
      pool.query(`
        SELECT COALESCE(SUM(total), 0)::float AS revenue, COUNT(*)::int AS orders
        FROM orders WHERE status <> 'cancelled' AND created_at >= CURRENT_DATE - INTERVAL '13 days'`),
    ]);

    res.json({
      daily: dailyRes.rows,
      byStatus: statusRes.rows,
      topProducts: topRes.rows,
      totals: totalsRes.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ───────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
const isVercel = !!process.env.VERCEL;

// Issue download tokens for eBook orders that were confirmed before the
// secure-download feature existed (idempotent backfill).
const backfillEbookTokens = async () => {
  try {
    const { rows } = await pool.query(
      `SELECT oi.id FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN products p ON p.id = oi.product_id
       JOIN categories c ON c.id = p.category_id
       WHERE c.name = 'ebooks' AND oi.download_token IS NULL
         AND o.status IN ('confirmed', 'delivered')`,
    );
    for (const r of rows) {
      await pool.query("UPDATE order_items SET download_token = $1 WHERE id = $2", [
        randomBytes(32).toString("hex"),
        r.id,
      ]);
    }
    if (rows.length > 0) console.log(`🔑 Backfilled ${rows.length} eBook download token(s)`);
  } catch (err) {
    console.error("❌ Token backfill error:", err.message);
  }
};

export const ready = initDB()
  .then(async () => {
    await backfillEbookTokens();
    if (!isVercel) {
      server.listen(PORT, () => {
        console.log(`🌱 Evergreen Ethiopia API running on http://localhost:${PORT}`);
      });
    }
  })
  .catch((err) => {
    console.error("❌ Failed to initialize database:", err);
  });

export default app;
