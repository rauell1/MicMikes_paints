# MicMikes Paints — Keekorok Edition

Bring Walls to Life — Colour That Lasts. Style That Inspires.

Production-grade full-stack paint e-commerce for the Kenyan market. Next.js 14, Neon PostgreSQL + Drizzle ORM, M-Pesa Daraja STK Push, Three.js visualizer.

## Stack
- Next.js 14 App Router + TypeScript + Tailwind CSS
- Neon PostgreSQL (pooled) `ep-soft-silence-ato3kpea-pooler.c-9.us-east-1.aws.neon.tech`
- Drizzle ORM (edge-compatible)
- NextAuth.js v5 (Credentials + Google OAuth)
- Zustand cart + per-click event tracking
- Three.js r128 + React Three Fiber
- M-Pesa Daraja + Flutterwave fallback
- pdfkit invoice generator
- Cloudinary + Resend
- Vercel edge deployment

## Quick start
```bash
npm install
cp .env.example .env
# set DATABASE_URL="postgresql://neondb_owner:npg_bLC9UV1hdJvW@ep-soft-silence-ato3kpea-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
npx drizzle-kit push
npm run dev
```

## Environment
See Section 13 in brief — MPESA_CONSUMER_KEY, MPESA_SHORTCODE 174379, CLOUDINARY_*, RESEND_API_KEY, NEXTAUTH_SECRET

## Visualizer
Tier 1 (default): WebGL fragment shader
```
paint = uColor * (lum * 2.0) + uSheen * pow(lum, 8.0)
outRGB = mix(photo.rgb, paint, wallMask)
```
Tier 2: Three.js Room3D lazy-loaded

QA: colour swap <100ms, first preview <2s, no mask bleed

## Orders
pending → awaiting_payment → paid → approved → processing → shipped → delivered
Every status change logged to order_events with actor, IP, metadata.

Invoice: INV-YYYYMMDD-XXXX • pdfkit A4 • Cloudinary storage

## Tracking
cart_events: product_view, swatch_click, visualizer_open, add_to_cart, remove_from_cart, checkout_start
order_events: payment_initiated, payment_success, order_created, invoice_generated, approved …

Last updated: 2026-01-28 · a8f3c2e1
