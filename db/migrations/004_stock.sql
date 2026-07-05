-- Migration 004: product stock tracking
-- Run once against your Neon database.
-- Each row tracks stock for a (product, size, colour?) variant.

CREATE TABLE IF NOT EXISTS product_stock (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size                TEXT NOT NULL,          -- e.g. '1L', '4L', '20L'
  colour_id           UUID REFERENCES colours(id) ON DELETE SET NULL,
  stock               INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per (product, size, colour) triple
CREATE UNIQUE INDEX IF NOT EXISTS product_stock_variant_idx
  ON product_stock (product_id, size, COALESCE(colour_id, '00000000-0000-0000-0000-000000000000'::uuid));

COMMENT ON TABLE product_stock IS
  'Tracks sellable stock per product/size/colour variant. '
  'colour_id is NULL for products that do not come in multiple colours.';
