-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4 — DATA MIGRATION FROM EXISTING PUBLIC SCHEMA
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Migrate public.colours -> catalog.shades
-- Assign to a default colour_family 'Keekorok Edition'
INSERT INTO catalog.shades (id, family_id, code, name, hex_value, lrv, undertone, is_active)
SELECT
  c.id,
  '11a2bd1f-1111-2222-3333-444455556666'::uuid AS family_id,
  c.code,
  c.name,
  c.hex AS hex_value,
  NULL::numeric AS lrv,
  NULL::text AS undertone,
  true AS is_active
FROM public.colours c
ON CONFLICT (code) DO NOTHING;

-- 2. Migrate public.products -> catalog.products
-- Assign vendor_id = MicMikes first_party vendor UUID
INSERT INTO catalog.products (id, vendor_id, category_id, product_type, slug, name, short_description, status, is_featured, is_exterior_grade, is_new_release, created_at, updated_at)
SELECT
  id,
  '99b7ad4f-4d32-473d-88b0-51a8cc3f5ba0'::uuid AS vendor_id,
  NULL::uuid AS category_id,
  (CASE WHEN category IN ('interior', 'exterior') THEN 'paint'::text
        WHEN category = 'primer' THEN 'primer'::text
        ELSE 'accessory'::text END) AS product_type,
  slug,
  name,
  blurb AS short_description,
  (CASE WHEN active THEN 'active'::text ELSE 'draft'::text END) AS status,
  false AS is_featured,
  (CASE WHEN category = 'exterior' THEN true ELSE false END) AS is_exterior_grade,
  false AS is_new_release,
  created_at,
  created_at AS updated_at
FROM public.products
ON CONFLICT (slug) DO NOTHING;

-- 3. Migrate public.variants -> catalog.product_variants
-- Derive finish_id from catalog.finishes using product slug
-- Map pack sizes to pack_size_ml (1L=1000, 4L=4000, 20L=20000)
-- Map existing prices to list_price_minor (KES * 100)
INSERT INTO catalog.product_variants (id, product_id, shade_id, finish_id, pack_size_ml, sku, currency_code, list_price_minor, is_active)
SELECT
  v.id,
  v.product_id,
  NULL::uuid AS shade_id,
  (CASE WHEN p.slug = 'keekorok-matte-emulsion' THEN '00f1bd7f-1111-4444-a0bb-26aa77dd8e10'::uuid
        WHEN p.slug = 'eggshell-heritage'       THEN '00f1bd7f-2222-4444-a0bb-26aa77dd8e10'::uuid
        WHEN p.slug = 'satin-silk-finish'       THEN '00f1bd7f-3333-4444-a0bb-26aa77dd8e10'::uuid
        WHEN p.slug = 'semi-gloss-acrylic'      THEN '00f1bd7f-4444-4444-a0bb-26aa77dd8e10'::uuid
        WHEN p.slug = 'weathershield-exterior'  THEN '00f1bd7f-5555-4444-a0bb-26aa77dd8e10'::uuid
        ELSE NULL::uuid END) AS finish_id,
  (CASE WHEN v.size = '1L' THEN 1000
        WHEN v.size = '4L' THEN 4000
        WHEN v.size = '20L' THEN 20000
        ELSE 1000 END) AS pack_size_ml,
  CONCAT(p.slug, '-', LOWER(v.size)) AS sku,
  'KES' AS currency_code,
  v.price_kes * 100 AS list_price_minor,
  true AS is_active
FROM public.variants v
JOIN public.products p ON p.id = v.product_id
ON CONFLICT (sku) DO NOTHING;

-- 4. Migrate public.product_stock -> catalog.inventory_items
INSERT INTO catalog.inventory_items (variant_id, on_hand_qty, reserved_qty, reorder_level, updated_at)
SELECT
  pv.id AS variant_id,
  ps.stock AS on_hand_qty,
  0 AS reserved_qty,
  ps.low_stock_threshold AS reorder_level,
  COALESCE(ps.updated_at, now()) AS updated_at
FROM public.product_stock ps
JOIN catalog.product_variants pv ON pv.product_id = ps.product_id
  AND pv.pack_size_ml = (CASE WHEN ps.size = '1L' THEN 1000 WHEN ps.size = '4L' THEN 4000 WHEN ps.size = '20L' THEN 20000 ELSE 1000 END)
ON CONFLICT (variant_id) DO UPDATE
SET on_hand_qty = EXCLUDED.on_hand_qty,
    reorder_level = EXCLUDED.reorder_level,
    updated_at = EXCLUDED.updated_at;

-- 5. Migrate users to customer.customers
INSERT INTO customer.customers (id, email, phone_e164, full_name, status, created_at, updated_at)
SELECT
  id,
  email,
  phone AS phone_e164,
  name AS full_name,
  (CASE WHEN deleted_at IS NOT NULL THEN 'disabled'::text ELSE 'active'::text END) AS status,
  created_at,
  updated_at
FROM public.users
ON CONFLICT (email) DO NOTHING;

-- 6. Migrate public.orders & public.order_items -> commerce.orders & commerce.order_items
-- Make sure any guest/additional customer emails are in customer.customers first
INSERT INTO customer.customers (id, email, phone_e164, full_name, status, created_at, updated_at)
SELECT
  DISTINCT ON (email)
  COALESCE(user_id, gen_random_uuid()) AS id,
  email,
  phone AS phone_e164,
  name AS full_name,
  'active' AS status,
  created_at,
  updated_at
FROM public.orders
ON CONFLICT (email) DO NOTHING;

-- Create temporary mapping of order ID to address ID
CREATE TEMP TABLE temp_order_addresses AS
SELECT
  o.id AS order_id,
  gen_random_uuid() AS address_id,
  c.id AS customer_id
FROM public.orders o
JOIN customer.customers c ON c.email = o.email;

-- Insert into customer.addresses
INSERT INTO customer.addresses (id, customer_id, county_code, locality, building_name, recipient_name, recipient_phone_e164)
SELECT
  t.address_id,
  t.customer_id,
  o.county,
  o.town,
  o.address,
  o.name,
  o.phone
FROM temp_order_addresses t
JOIN public.orders o ON o.id = t.order_id;

-- Insert orders
INSERT INTO commerce.orders (id, order_number, customer_id, vendor_id, status, currency_code, subtotal_minor, discount_minor, shipping_minor, tax_minor, total_minor, payment_status, fulfillment_status, billing_address_id, shipping_address_id, placed_at, created_at)
SELECT
  o.id,
  CONCAT('MMK-', LPAD(row_number() OVER (ORDER BY o.created_at)::text, 6, '0')) AS order_number,
  t.customer_id,
  '99b7ad4f-4d32-473d-88b0-51a8cc3f5ba0'::uuid AS vendor_id,
  (CASE WHEN o.status = 'pending' THEN 'pending_payment'::text
        WHEN o.status = 'paid' THEN 'paid'::text
        WHEN o.status = 'delivered' THEN 'delivered'::text
        ELSE 'pending_payment'::text END) AS status,
  'KES' AS currency_code,
  o.subtotal_kes * 100 AS subtotal_minor,
  0 AS discount_minor,
  o.delivery_kes * 100 AS shipping_minor,
  0 AS tax_minor,
  o.total_kes * 100 AS total_minor,
  (CASE WHEN o.status = 'paid' OR o.status = 'delivered' THEN 'paid'::text
        ELSE 'unpaid'::text END) AS payment_status,
  (CASE WHEN o.status = 'delivered' THEN 'fulfilled'::text
        ELSE 'unfulfilled'::text END) AS fulfillment_status,
  t.address_id AS billing_address_id,
  t.address_id AS shipping_address_id,
  o.created_at AS placed_at,
  o.created_at
FROM public.orders o
JOIN temp_order_addresses t ON t.order_id = o.id
ON CONFLICT (id) DO NOTHING;

-- Insert order items
INSERT INTO commerce.order_items (id, order_id, variant_id, product_name, shade_name, finish_name, pack_size_ml, vendor_sku, quantity, unit_price_minor, line_total_minor)
SELECT
  oi.id,
  oi.order_id,
  pv.id AS variant_id,
  p.name AS product_name,
  sh.name AS shade_name,
  oi.finish AS finish_name,
  pv.pack_size_ml,
  pv.sku AS vendor_sku,
  oi.quantity,
  oi.unit_kes * 100 AS unit_price_minor,
  oi.unit_kes * oi.quantity * 100 AS line_total_minor
FROM public.order_items oi
JOIN catalog.products p ON p.id = oi.product_id
LEFT JOIN catalog.shades sh ON sh.id = oi.colour_id
LEFT JOIN catalog.product_variants pv ON pv.product_id = oi.product_id
  AND pv.pack_size_ml = (CASE WHEN oi.size = '1L' THEN 1000 WHEN oi.size = '4L' THEN 4000 WHEN oi.size = '20L' THEN 20000 ELSE 1000 END)
ON CONFLICT (id) DO NOTHING;

-- Clean up temp table
DROP TABLE temp_order_addresses;

-- 7. Migrate public.mpesa_payments -> payment.payment_attempts & payment.legacy_mpesa_mapping
INSERT INTO payment.payment_attempts (id, order_id, payment_method_id, provider_reference, provider_request_id, amount_minor, currency_code, phone_e164, status, failure_reason, raw_request, raw_response, reconciled_at, created_at, updated_at)
SELECT
  id,
  order_id,
  '77e1bd6f-0043-4422-90bf-fb488f28fa99'::uuid AS payment_method_id,
  mpesa_receipt AS provider_reference,
  checkout_request_id AS provider_request_id,
  amount_kes * 100 AS amount_minor,
  'KES' AS currency_code,
  phone AS phone_e164,
  (CASE WHEN LOWER(status) = 'success' THEN 'success'::text
        WHEN LOWER(status) = 'pending' THEN 'pending'::text
        WHEN LOWER(status) = 'cancelled' THEN 'cancelled'::text
        ELSE 'failed'::text END) AS status,
  failure_reason,
  COALESCE(raw_callback, '{}'::jsonb) AS raw_request,
  COALESCE(raw_callback, '{}'::jsonb) AS raw_response,
  completed_at AS reconciled_at,
  initiated_at AS created_at,
  COALESCE(completed_at, initiated_at) AS updated_at
FROM public.mpesa_payments
ON CONFLICT (id) DO NOTHING;

INSERT INTO payment.legacy_mpesa_mapping (new_attempt_id, legacy_row_id, migrated_at)
SELECT
  id AS new_attempt_id,
  id AS legacy_row_id,
  now() AS migrated_at
FROM public.mpesa_payments
ON CONFLICT DO NOTHING;

-- 8. Migrate public.rooms -> customer.saved_rooms
-- Assign to a default system customer
INSERT INTO customer.customers (id, email, full_name, status)
VALUES ('88d8bd7f-94d3-488f-a0bb-26aa77dd8e10', 'system-showcase@micmikespaints.co.ke', 'Showcase System', 'active')
ON CONFLICT DO NOTHING;

INSERT INTO customer.saved_rooms (id, customer_id, room_name, notes, created_at)
SELECT
  id,
  '88d8bd7f-94d3-488f-a0bb-26aa77dd8e10'::uuid AS customer_id,
  name AS room_name,
  CONCAT('Photo URL: ', photo_url, CASE WHEN wall_mask IS NOT NULL THEN CONCAT(', Wall Mask: ', wall_mask) ELSE '' END) AS notes,
  now() AS created_at
FROM public.rooms
ON CONFLICT (id) DO NOTHING;

-- 9. Migrate public.delivery_rates -> delivery.delivery_zones
INSERT INTO delivery.delivery_zones (id, country_code, county_code, locality, zone_name, base_fee_minor, free_delivery_threshold_minor, estimated_days_min, estimated_days_max, is_active)
SELECT
  id,
  'KE' AS country_code,
  county AS county_code,
  town AS locality,
  CONCAT(county, ' - ', COALESCE(town, 'Default')) AS zone_name,
  rate_kes * 100 AS base_fee_minor,
  1500000 AS free_delivery_threshold_minor,
  1 AS estimated_days_min,
  3 AS estimated_days_max,
  true AS is_active
FROM public.delivery_rates
ON CONFLICT (id) DO NOTHING;

-- 10. Migrate public.cart_events -> analytics.events
INSERT INTO analytics.events (customer_id, session_id, event_name, entity_type, entity_id, event_ts, properties)
SELECT
  user_id AS customer_id,
  session_id,
  (CASE WHEN event_type = 'add' THEN 'add_to_cart'
        WHEN event_type = 'remove' THEN 'remove_from_cart'
        ELSE event_type END) AS event_name,
  'product' AS entity_type,
  product_id AS entity_id,
  created_at AS event_ts,
  jsonb_build_object(
    'colour_id', colour_id,
    'size', size,
    'finish', finish,
    'quantity', quantity,
    'unit_price_minor', unit_kes * 100
  ) AS properties
FROM public.cart_events;

COMMIT;
