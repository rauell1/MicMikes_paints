# SITEMAP.md
> Auto-generated 2026-01-28

Public routes
- /
- /shop
- /colours
- /product/[slug]
- /visualizer
- /cart
- /checkout
- /order/[id]
- /account
- /auth/login
- /auth/register

Admin routes (role: admin|staff)
- /admin
- /admin/orders
- /admin/orders/[id]
- /admin/invoices
- /admin/products
- /admin/rooms
- /admin/analytics
- /admin/settings

API
- POST /api/auth/[...nextauth]
- POST /api/mpesa/stkpush
- POST /api/mpesa/callback
- GET  /api/mpesa/status/[id]
- POST /api/flutterwave/checkout
- POST /api/events/cart
- POST /api/admin/orders/[id]/approve
- GET  /api/invoices/[orderId]

Machine sitemap: /sitemap.xml (Next.js app/sitemap.ts)
