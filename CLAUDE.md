# CLAUDE.md — MicMikes Paints AI Context
> Last updated: 2026-07-05

## Project
MicMikes Paints Keekorok — React 19 + Vite 7 + Tailwind CSS 4 + TypeScript SPA  
Deployed on Vercel (serverless functions in `/api`, static SPA from `/dist`)  
Kenyan e-commerce — M-Pesa first, KES pricing, Nairobi delivery

---

## Tech Stack
- **Frontend:** React 19, Vite 7, Tailwind CSS 4 (NOT Next.js)
- **API:** Vercel Serverless Functions (Node.js) in `/api`
- **DB:** Neon PostgreSQL via `@neondatabase/serverless` HTTP driver
- **Auth:** HMAC-SHA256 signed tokens stored as httpOnly cookies (not localStorage)
- **Analytics:** `@vercel/analytics`

---

## Database
Neon PostgreSQL · project `lucky-flower-14546790`  
Connection string in `DATABASE_URL` env var

Tables: `products`, `variants`, `colours`, `rooms`, `orders`, `order_items`,
`order_events`, `cart_events`, `mpesa_payments`, `delivery_rates`, `customers`

---

## Key Rules
- KES prices as integers (whole shillings)
- UUIDs everywhere — no auto-increment IDs
- Every cart action → `POST /api/cart-events` → `cart_events` table
- Every order status change → `INSERT order_events` (immutable audit trail)
- Invoice format: `INV-YYYYMMDD-XXXX`
- M-Pesa phone: `2547XXXXXXXX` format (normalised from `07xx` on entry)

---

## Serverless Functions (9 total — Hobby plan limit is 12)

| File | URL(s) served |
|---|---|
| `api/admin.ts` | `/api/admin/*` (all admin routes via `?_r=` param — see vercel.json) |
| `api/colours.ts` | `GET /api/colours` · `?popular=1` · `?type=rooms` |
| `api/delivery-rates.ts` | `GET /api/delivery-rates` · `?county=&town=` |
| `api/products.ts` | `GET /api/products` |
| `api/orders.ts` | `GET /api/orders/:id` (customer order tracking) |
| `api/cart-events.ts` | `POST /api/cart-events` |
| `api/recolour.ts` | `POST /api/recolour` (visualizer image processing) |
| `api/mpesa/stkpush.ts` | `POST /api/mpesa/stkpush` · `GET ?_r=status&id=<checkoutRequestId>` |
| `api/mpesa/callback.ts` | `POST /api/mpesa/callback` (Safaricom webhook) |

---

## vercel.json Routing

All admin sub-routes are rewritten to a single function via `?_r=` query param:

```
/api/admin/login          → /api/admin?_r=login
/api/admin/dashboard      → /api/admin?_r=dashboard
/api/admin/customers      → /api/admin?_r=customers
/api/admin/stock          → /api/admin?_r=stock
/api/admin/colours        → /api/admin?_r=colours
/api/admin/products       → /api/admin?_r=products
/api/admin/variants       → /api/admin?_r=variants
/api/admin/rooms          → /api/admin?_r=rooms
/api/admin/orders         → /api/admin?_r=orders
/api/admin/delivery-rates → /api/admin?_r=delivery-rates
```

M-Pesa status polling (backwards-compatible):
```
/api/mpesa/status/:id     → /api/mpesa/stkpush?_r=status&id=:id
```

SPA catch-all:
```
/((?!api/).*)             → /index.html
```

---

## CRITICAL: Vercel Function Isolation
Each `.ts` file in `/api` is compiled independently — **shared imports from a
`/api/_lib` directory DO NOT work at runtime.** Vercel does not bundle sibling
directories. Auth logic (`verifyAdminToken`) must be inlined in every admin
route handler inside `api/admin.ts`.

---

## Environment Variables
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `ADMIN_JWT_SECRET` | HMAC key for admin cookie signing |
| `MPESA_CONSUMER_KEY` | Safaricom app consumer key |
| `MPESA_CONSUMER_SECRET` | Safaricom app consumer secret |
| `MPESA_SHORTCODE` | Paybill / till number |
| `MPESA_PASSKEY` | STK push passkey |
| `MPESA_ENVIRONMENT` | `production` or `sandbox` |
| `MPESA_CALLBACK_URL` | Override callback URL (required in non-prod) |
