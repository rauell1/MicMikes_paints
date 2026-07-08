-- 007_order_item_reserved_qty.sql
-- Records how much stock each order line reserved, so reservations can be
-- released (on cancel / 30-day cleanup) or committed (on delivery) precisely
-- and idempotently. See src/server/inventory.ts.
ALTER TABLE commerce.order_items
  ADD COLUMN IF NOT EXISTS reserved_qty integer NOT NULL DEFAULT 0;
