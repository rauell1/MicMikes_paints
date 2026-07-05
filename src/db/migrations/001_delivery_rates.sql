-- Run this in your Neon SQL console
-- Creates the delivery_rates table for admin-managed per-location delivery fees

CREATE TABLE IF NOT EXISTS delivery_rates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  county     TEXT NOT NULL,
  town       TEXT,              -- NULL means "all towns in county"
  rate_kes   INTEGER NOT NULL DEFAULT 0,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups during checkout
CREATE INDEX IF NOT EXISTS idx_delivery_rates_county ON delivery_rates (county);
CREATE INDEX IF NOT EXISTS idx_delivery_rates_county_town ON delivery_rates (county, town);

-- Ensure updated_at column exists on orders (add if missing)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
