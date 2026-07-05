-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 005: RBAC users + fix product_stock seeding
-- Run once against your Neon database (idempotent — safe to re-run).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- STEP 1: Ensure product_stock table exists (004 may not have been applied)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_stock (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size                TEXT NOT NULL CHECK (size IN ('1L', '4L', '20L')),
  colour_id           UUID REFERENCES colours(id) ON DELETE SET NULL,
  stock               INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_stock_variant_idx
  ON product_stock (product_id, size, COALESCE(colour_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Seed one stock row per product×size from existing variants (stock = 0 as starting point)
INSERT INTO product_stock (product_id, size, colour_id, stock, low_stock_threshold)
SELECT v.product_id, v.size, NULL, 0, 5
FROM variants v
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- STEP 2: RBAC — users table
--   Roles:
--     owner     — full admin (you). Can do everything.
--     admin     — staff admin. Can manage orders, stock, colours, products.
--     delivery  — delivery personnel. Can only see and update orders assigned to them.
--     customer  — registered buyers. Can view their own orders + track.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TYPE IF NOT EXISTS user_role AS ENUM ('owner', 'admin', 'delivery', 'customer');

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role          user_role NOT NULL DEFAULT 'customer',
  name          TEXT NOT NULL,
  email         TEXT UNIQUE,                        -- nullable for delivery staff added by phone only
  phone         TEXT UNIQUE,                        -- M-Pesa / WhatsApp number
  password_hash TEXT,                               -- bcrypt; NULL = invite-only / OTP login
  -- delivery staff extras
  vehicle_reg   TEXT,                               -- e.g. KCB 123X
  area_coverage TEXT,                               -- e.g. 'Kiambu, Ruiru, Thika'
  -- flags
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  -- audit
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS users_role_idx   ON users (role);
CREATE INDEX IF NOT EXISTS users_phone_idx  ON users (phone);
CREATE INDEX IF NOT EXISTS users_email_idx  ON users (email);

COMMENT ON TABLE users IS
  'RBAC users. Roles: owner (full), admin (staff), delivery (fleet), customer (buyer).';

-- ─────────────────────────────────────────────────────────────────────────
-- STEP 3: Link orders → delivery person + customer account
-- ─────────────────────────────────────────────────────────────────────────

-- Add delivery assignment column to orders (safe if already added)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_assigned_to_idx ON orders (assigned_to);
CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON orders (customer_id);

-- ─────────────────────────────────────────────────────────────────────────
-- STEP 4: Delivery sessions (JWT-less token for delivery staff mobile app)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,   -- SHA-256 hex of the raw bearer token
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 days',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent TEXT,
  ip_address INET
);

CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx ON user_sessions (user_id);
CREATE INDEX IF NOT EXISTS user_sessions_expires_idx ON user_sessions (expires_at);

-- ─────────────────────────────────────────────────────────────────────────
-- STEP 5: Customer-facing order history view
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW customer_orders AS
SELECT
  o.id, o.reference, o.name, o.phone, o.county, o.town,
  o.total_kes, o.status, o.mpesa_ref, o.created_at,
  o.customer_id,
  u.name AS customer_name
FROM orders o
LEFT JOIN users u ON u.id = o.customer_id;

COMMENT ON VIEW customer_orders IS
  'Orders enriched with customer_id for customer-portal queries. '
  'Always filter by customer_id = $1 in customer-facing API calls.';
