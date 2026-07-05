-- Migration: 004_delivery_rates
-- Run this once against your Neon DB to create the delivery_rates table.
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS delivery_rates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  county     TEXT NOT NULL,
  town       TEXT,                          -- NULL = county-level default rate
  rate_kes   INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT delivery_rates_county_town_unique UNIQUE (county, town)
);

-- Seed a few common Kenyan counties so the UI isn't empty on first load.
-- Update rates to your actual delivery costs.
INSERT INTO delivery_rates (county, town, rate_kes) VALUES
  ('Nairobi',   NULL,          0),
  ('Nairobi',   'CBD',         0),
  ('Nairobi',   'Westlands',   0),
  ('Kiambu',    NULL,        300),
  ('Kiambu',    'Ruiru',     200),
  ('Kiambu',    'Thika',     250),
  ('Mombasa',   NULL,        800),
  ('Kisumu',    NULL,        900),
  ('Nakuru',    NULL,        700),
  ('Machakos',  NULL,        500),
  ('Kajiado',   NULL,        400),
  ('Muranga',   NULL,        550)
ON CONFLICT (county, town) DO NOTHING;
