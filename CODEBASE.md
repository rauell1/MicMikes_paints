# CODEBASE.md
> 2026-01-28

```
app/
  (public)/
    page.tsx                 # Homepage – hero visualizer teaser
    shop/page.tsx
    colours/page.tsx
    product/[slug]/page.tsx
    visualizer/page.tsx
    cart/page.tsx
    checkout/page.tsx
    order/[id]/page.tsx
    account/page.tsx
  admin/
    layout.tsx
    page.tsx                 # Dashboard
    orders/page.tsx
    orders/[id]/page.tsx
    invoices/page.tsx
    products/page.tsx
    rooms/page.tsx
    analytics/page.tsx
  api/
    mpesa/stkpush/route.ts
    mpesa/callback/route.ts
    events/cart/route.ts
    invoices/[orderId]/route.ts
components/
  visualizer/
    WallPreview.tsx          # Tier 1 WebGL
    Room3D.tsx               # Tier 2 Three.js
    BeforeAfterSlider.tsx
  PaintCard.tsx
  ColourGrid.tsx
lib/
  db.ts                      # drizzle + neon-http
  schema.ts                  # 12 tables
  mpesa.ts
  generateInvoicePdf.ts
  invoice.ts
store/cart.ts                # Zustand + trackCartEvent
```

API index
- POST /api/mpesa/stkpush – initiate STK
- POST /api/mpesa/callback – Safaricom webhook
- POST /api/events/cart – cart_events insert
- GET  /api/invoices/:orderId – pdfkit generate

DB: Neon PostgreSQL · Drizzle ORM · 12 tables · UUID PKs
