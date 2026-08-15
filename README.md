# Ershaye (እርሻዬ) — API Server

Backend for **Ershaye**, an Ethiopian online shop for fresh, chemical-free produce grown on vertical farms.

## Tech Stack

- **Runtime:** Node.js / Bun
- **Framework:** Express
- **Database:** PostgreSQL (Neon) via `pg` — connection string in `.env` (`DB=`)
- **Image uploads:** Cloudinary via `multer-storage-cloudinary`
- **Realtime:** Socket.io (new order / message notifications)
- **Email:** Nodemailer (optional, only used when SMTP vars are configured)

## Setup

```bash
bun install
# Edit .env — at minimum set DB to your Neon connection string
bun run seed    # creates tables + seeds categories, products, admin, posts
bun run dev     # nodemon, listens on PORT (default 4000)
```

The seed script creates an admin account and prints its credentials.

## API Overview

| Method | Endpoint | Auth | Purpose |
| ------ | -------- | ---- | ------- |
| POST | `/api/auth/login` | — | Admin login → JWT |
| GET | `/api/categories` | — | Product categories (bilingual) |
| GET | `/api/products` | — | List products (`category`, `search`, `featured`, `sort`) |
| GET | `/api/products/:slug` | — | Single product |
| POST | `/api/products` | admin | Create product (multipart image) |
| PUT | `/api/products/:id` | admin | Update product |
| DELETE | `/api/products/:id` | admin | Delete product |
| POST | `/api/orders` | — | Place order (COD or bank transfer) |
| POST | `/api/orders/:ref/payment-receipt` | — | Upload bank receipt image (multipart `receipt`) |
| GET | `/api/orders/track` | — | Public tracking by `ref` (+ optional `phone`) |
| GET | `/api/orders` | admin | List orders (filter by `status`) |
| PATCH | `/api/orders/:id/status` | admin | Update order status |
| GET | `/api/posts` / `/api/posts/:id` | — | Blog (bilingual) |
| POST | `/api/posts` | admin | Create post |
| PUT/DELETE | `/api/posts/:id` | admin | Update / delete post |
| POST | `/api/contact` | — | Contact form → inbox |
| GET | `/api/messages` | admin | Inbox |
| POST | `/api/messages/:id/reply` | admin | Reply to a message |
| GET | `/api/dashboard/stats` | admin | Overview stats |
| GET/PATCH | `/api/settings` | —/admin | Shop settings (delivery fee, etc.) |

## Database

Schema is defined in `config/db.js` (`initDB`) and mirrored in `models/schema.sql`.
Seed data lives in `scripts/seed.js` (20 produce products across 4 bilingual categories, 2 blog posts, 1 superadmin).
"# agri-backends" 
# evergreen-backends
