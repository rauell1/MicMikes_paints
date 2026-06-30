# CLAUDE.md — MicMikes Paints AI Context
> Auto-generated 2026-01-28 · commit a8f3c2e1

## Project
MicMikes Paints Keekorok — Next.js 14 App Router + TypeScript
Production-grade Kenyan e-commerce — M-Pesa first, KES pricing

## Database
Neon PostgreSQL · Drizzle ORM
Connection: ep-soft-silence-ato3kpea-pooler.c-9.us-east-1.aws.neon.tech
Migrate: npx drizzle-kit push

Tables (12):
users, products, variants, colours, product_colours, rooms,
orders, order_items, order_events, cart_events, invoices, saved_colours

## Key Rules
- KES prices as integers (whole shillings)
- UUIDs everywhere, no auto-increment IDs
- Every cart action → POST /api/events/cart → cart_events table
- Every order status change → INSERT order_events (audit trail)
- Invoice format: INV-YYYYMMDD-XXXX
- M-Pesa phone: 2547XXXXXXXX format
- NextAuth v5 roles: customer|staff|admin
- Visualizer: Tier 1 WebGL fragment shader, Tier 2 Three.js R3F lazy

## API Routes
POST /api/mpesa/stkpush
POST /api/mpesa/callback
GET  /api/mpesa/status/[id]
POST /api/events/cart
POST /api/admin/orders/[id]/approve
GET  /api/invoices/[orderId]

## Last Commit: main · a8f3c2e1 · feat: keekorok visualizer production
- Visualizer Tier1 shader live
- M-Pesa sandbox callback verified
- Invoice pdfkit generator stable
- order_events audit trail complete
- Admin CMS rooms uploader shipped
