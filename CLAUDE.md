# CLAUDE.md — MicMikes Paints AI Context

## Project
MicMikes Paints Keekorok — React 19 + Vite 7 + Tailwind 4 + TypeScript SPA
Deployed on Vercel (serverless functions in /api, static SPA in /src)
Kenyan e-commerce — M-Pesa first, KES pricing, Nairobi delivery

## Tech Stack
- Frontend: React 19, Vite 7, Tailwind CSS 4 (NOT Next.js)
- API: Vercel Serverless Functions (Node.js) in /api directory
- DB: Neon PostgreSQL via @neondatabase/serverless HTTP driver
- Auth: HMAC-SHA256 signed tokens stored as httpOnly cookies (not localStorage)
- Analytics: @vercel/analytics

## Database
Neon PostgreSQL · project lucky-flower-14546790
Connection string in ADMIN_JWT_SECRET env var

Tables: products, variants, colours, rooms, orders, order_items, order_events, cart_events

## Key Rules
- KES prices as integers (whole shillings)
- UUIDs everywhere, no auto-increment IDs
- Every cart action → POST /api/events/cart → cart_events table
- Every order status change → INSERT order_events (audit trail)
- Invoice format: INV-YYYYMMDD-XXXX
- M-Pesa phone: 2547XXXXXXXX format

## API Routes
GET/POST/PUT/DELETE /api/admin/colours
GET/POST/PUT/DELETE /api/admin/products
GET/PUT            /api/admin/variants
GET/POST/PUT/DELETE /api/admin/rooms
GET/PUT            /api/admin/orders
GET/POST/DELETE    /api/admin/login   (cookie auth)
POST /api/cart-events
POST /api/mpesa/stkpush
POST /api/mpesa/callback
GET  /api/mpesa/status/[id]

## IMPORTANT: Vercel Function Isolation
Each .ts file in /api is compiled independently. Shared imports from /api/_lib
DO NOT work at runtime — Vercel does not bundle sibling directories.
Auth logic (verifyAdminToken) must be inlined in each admin route file.
