-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3A — Create schema namespaces
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS iam;
CREATE SCHEMA IF NOT EXISTS vendor;
CREATE SCHEMA IF NOT EXISTS catalog;
CREATE SCHEMA IF NOT EXISTS commerce;
CREATE SCHEMA IF NOT EXISTS payment;
CREATE SCHEMA IF NOT EXISTS customer;
CREATE SCHEMA IF NOT EXISTS delivery;
CREATE SCHEMA IF NOT EXISTS search;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS integration;
CREATE SCHEMA IF NOT EXISTS regulatory;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3B — IAM / Staff & RBAC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS iam.staff_users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL UNIQUE,
  phone_e164      text,
  full_name       text NOT NULL,
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('invited','active','suspended','disabled')),
  is_super_admin  boolean NOT NULL DEFAULT false,
  last_login_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS iam.departments (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS iam.teams (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid REFERENCES iam.departments(id) ON DELETE SET NULL,
  code          text NOT NULL UNIQUE,
  name          text NOT NULL
);

CREATE TABLE IF NOT EXISTS iam.roles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text NOT NULL UNIQUE,
  name       text NOT NULL,
  scope_type text NOT NULL
               CHECK (scope_type IN
                 ('global','department','team','vendor','category')),
  is_system  boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS iam.permissions (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource text NOT NULL,
  action   text NOT NULL,
  UNIQUE (resource, action)
);

CREATE TABLE IF NOT EXISTS iam.role_permissions (
  role_id       uuid NOT NULL REFERENCES iam.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES iam.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS iam.staff_role_assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES iam.staff_users(id) ON DELETE CASCADE,
  role_id       uuid NOT NULL REFERENCES iam.roles(id) ON DELETE CASCADE,
  team_id       uuid REFERENCES iam.teams(id) ON DELETE CASCADE,
  vendor_id     uuid,
  category_id   uuid,
  granted_by    uuid REFERENCES iam.staff_users(id),
  granted_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz
);

CREATE TABLE IF NOT EXISTS iam.audit_logs (
  id          bigserial PRIMARY KEY,
  actor_type  text NOT NULL CHECK (actor_type IN ('staff','vendor','customer','system')),
  actor_id    uuid,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   uuid,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address  inet,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_role_assignments_staff_user_id_idx ON iam.staff_role_assignments (staff_user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS audit_logs_entity_type_entity_id_created_at_desc_idx ON iam.audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_id_created_at_desc_idx ON iam.audit_logs (actor_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3C — Vendor schema
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor.vendors (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_type         text NOT NULL CHECK (vendor_type IN ('first_party','third_party')),
  legal_name          text NOT NULL,
  display_name        text NOT NULL,
  slug                text NOT NULL UNIQUE,
  email               text,
  phone_e164          text,
  whatsapp_e164       text,
  website_url         text,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','verified','rejected','suspended')),
  country_code        char(2) NOT NULL DEFAULT 'KE',
  county_code         text,
  subcounty_code      text,
  locality            text,
  estate              text,
  landmark            text,
  logo_media_id       uuid,
  brand_summary       text,
  verification_level  text NOT NULL DEFAULT 'basic'
                        CHECK (verification_level IN ('basic','standard','enhanced')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendor.vendor_contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   uuid NOT NULL REFERENCES vendor.vendors(id) ON DELETE CASCADE,
  full_name   text NOT NULL,
  role_title  text,
  email       text,
  phone_e164  text,
  is_primary  boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS vendor.vendor_compliance_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id       uuid NOT NULL REFERENCES vendor.vendors(id) ON DELETE CASCADE,
  doc_type        text NOT NULL,
  doc_number      text,
  issuing_country char(2),
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','expired')),
  expires_at      timestamptz,
  media_id        uuid,
  reviewed_by     uuid REFERENCES iam.staff_users(id),
  reviewed_at     timestamptz,
  notes           text
);

CREATE TABLE IF NOT EXISTS vendor.vendor_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id     uuid NOT NULL REFERENCES vendor.vendors(id) ON DELETE CASCADE,
  email         text NOT NULL,
  phone_e164    text,
  full_name     text NOT NULL,
  status        text NOT NULL DEFAULT 'invited'
                  CHECK (status IN ('invited','active','suspended')),
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, email)
);

CREATE TABLE IF NOT EXISTS vendor.payout_configs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id        uuid NOT NULL UNIQUE REFERENCES vendor.vendors(id) ON DELETE CASCADE,
  payout_method    text NOT NULL CHECK (payout_method IN ('mpesa','bank_transfer')),
  account_name     text NOT NULL,
  account_number   text NOT NULL,
  bank_code        text,
  mpesa_shortcode  text,
  currency_code    char(3) NOT NULL DEFAULT 'KES',
  min_payout_minor int NOT NULL DEFAULT 100000,
  payout_schedule  text NOT NULL DEFAULT 'weekly'
                     CHECK (payout_schedule IN ('daily','weekly','monthly','manual')),
  is_verified      boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3D — Catalogue schema (paint-specific)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalog.colour_families (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text NOT NULL UNIQUE,
  name       text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS catalog.shades (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid REFERENCES catalog.colour_families(id) ON DELETE SET NULL,
  code      text NOT NULL UNIQUE,
  name      text NOT NULL UNIQUE,
  hex_value text,
  lrv       numeric(5,2),
  undertone text,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS catalog.finishes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  sheen_level int NOT NULL,
  is_active   boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS catalog.product_categories (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES catalog.product_categories(id) ON DELETE SET NULL,
  code      text NOT NULL UNIQUE,
  name      text NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog.products (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id         uuid NOT NULL REFERENCES vendor.vendors(id),
  category_id       uuid REFERENCES catalog.product_categories(id),
  product_type      text NOT NULL CHECK (product_type IN ('paint','primer','accessory','service')),
  slug              text NOT NULL UNIQUE,
  name              text NOT NULL,
  short_description text,
  long_description  text,
  status            text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','active','archived','unpublished')),
  is_featured       boolean NOT NULL DEFAULT false,
  is_exterior_grade boolean NOT NULL DEFAULT false,
  is_new_release    boolean NOT NULL DEFAULT false,
  room_tags         text[] NOT NULL DEFAULT '{}',
  recommended_use   text[] NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog.paint_specs (
  product_id              uuid PRIMARY KEY REFERENCES catalog.products(id) ON DELETE CASCADE,
  washability_rating      int,
  voc_level_g_l           numeric(8,2),
  coverage_m2_per_l       numeric(8,2),
  drying_time_minutes     int,
  recoats_after_minutes   int,
  suitable_rooms          text[] NOT NULL DEFAULT '{}',
  application_surfaces    text[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS catalog.product_variants (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       uuid NOT NULL REFERENCES catalog.products(id) ON DELETE CASCADE,
  shade_id         uuid REFERENCES catalog.shades(id),
  finish_id        uuid REFERENCES catalog.finishes(id),
  pack_size_ml     int NOT NULL,
  sku              text NOT NULL UNIQUE,
  barcode          text,
  currency_code    char(3) NOT NULL DEFAULT 'KES',
  list_price_minor int NOT NULL,
  sale_price_minor int,
  cost_price_minor int,
  tax_class_code   text,
  stock_tracking   boolean NOT NULL DEFAULT true,
  is_active        boolean NOT NULL DEFAULT true,
  weight_grams     int,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, shade_id, finish_id, pack_size_ml)
);

CREATE TABLE IF NOT EXISTS catalog.inventory_items (
  variant_id    uuid PRIMARY KEY REFERENCES catalog.product_variants(id) ON DELETE CASCADE,
  on_hand_qty   int NOT NULL DEFAULT 0,
  reserved_qty  int NOT NULL DEFAULT 0,
  reorder_level int,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog.media_assets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type        text NOT NULL CHECK (owner_type IN
                      ('product','shade','vendor','customer_room','staff')),
  owner_id          uuid NOT NULL,
  media_kind        text NOT NULL CHECK (media_kind IN
                      ('image','swatch','visualizer','document','video')),
  storage_key       text NOT NULL,
  cdn_url           text,
  mime_type         text NOT NULL,
  width             int,
  height            int,
  alt_text          text,
  moderation_status text NOT NULL DEFAULT 'pending'
                      CHECK (moderation_status IN ('pending','approved','rejected')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog.promotions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id           uuid REFERENCES vendor.vendors(id),
  code                text,
  name                text NOT NULL,
  promo_type          text NOT NULL
                        CHECK (promo_type IN ('percent_off','flat_off','bogo',
                                              'free_shipping','bundle')),
  value               numeric(10,2) NOT NULL,
  currency_code       char(3) DEFAULT 'KES',
  applies_to          text NOT NULL
                        CHECK (applies_to IN ('order','product','category','vendor')),
  min_order_minor     int,
  max_uses            int,
  used_count          int NOT NULL DEFAULT 0,
  stackable           boolean NOT NULL DEFAULT false,
  starts_at           timestamptz NOT NULL DEFAULT now(),
  ends_at             timestamptz,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_vendor_status_idx ON catalog.products (vendor_id, status);
CREATE INDEX IF NOT EXISTS product_variants_lookup_idx ON catalog.product_variants (shade_id, finish_id, pack_size_ml);
CREATE INDEX IF NOT EXISTS product_variants_pricing_idx ON catalog.product_variants (currency_code, list_price_minor);
CREATE INDEX IF NOT EXISTS inventory_items_available_idx ON catalog.inventory_items ((on_hand_qty - reserved_qty));
CREATE INDEX IF NOT EXISTS promotions_schedule_idx ON catalog.promotions (is_active, starts_at, ends_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3E — Customer schema
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer.customers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               text UNIQUE,
  phone_e164          text UNIQUE,
  full_name           text,
  status              text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','disabled')),
  marketing_opt_in    boolean NOT NULL DEFAULT false,
  analytics_consent   boolean NOT NULL DEFAULT false,
  data_export_requested_at timestamptz,
  deletion_requested_at    timestamptz,
  country_code        char(2) NOT NULL DEFAULT 'KE',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer.addresses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         uuid REFERENCES customer.customers(id) ON DELETE CASCADE,
  country_code        char(2) NOT NULL DEFAULT 'KE',
  county_code         text,
  subcounty_code      text,
  locality            text,
  estate              text,
  building_name       text,
  house_unit          text,
  landmark            text,
  recipient_name      text NOT NULL,
  recipient_phone_e164 text NOT NULL,
  postal_code         text,
  latitude            numeric(10,7),
  longitude           numeric(10,7),
  is_default          boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer.wishlists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customer.customers(id) ON DELETE CASCADE,
  variant_id  uuid NOT NULL REFERENCES catalog.product_variants(id) ON DELETE CASCADE,
  added_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, variant_id)
);

CREATE TABLE IF NOT EXISTS customer.saved_rooms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid NOT NULL REFERENCES customer.customers(id) ON DELETE CASCADE,
  room_name     text,
  room_type     text,
  shade_id      uuid REFERENCES catalog.shades(id),
  finish_id     uuid REFERENCES catalog.finishes(id),
  media_id      uuid,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer.refill_reminders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid NOT NULL REFERENCES customer.customers(id) ON DELETE CASCADE,
  order_id        uuid,
  variant_id      uuid REFERENCES catalog.product_variants(id),
  remind_at       timestamptz NOT NULL,
  sent_at         timestamptz,
  snoozed_until   timestamptz,
  is_active       boolean NOT NULL DEFAULT true
);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3F — Commerce schema
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commerce.carts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid REFERENCES customer.customers(id) ON DELETE SET NULL,
  session_id    text,
  currency_code char(3) NOT NULL DEFAULT 'KES',
  status        text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','converted','abandoned','merged')),
  coupon_code   text,
  promo_id      uuid REFERENCES catalog.promotions(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commerce.cart_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id          uuid NOT NULL REFERENCES commerce.carts(id) ON DELETE CASCADE,
  variant_id       uuid NOT NULL REFERENCES catalog.product_variants(id),
  quantity         int NOT NULL CHECK (quantity > 0),
  unit_price_minor int NOT NULL,
  added_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, variant_id)
);

CREATE TABLE IF NOT EXISTS commerce.orders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number        text NOT NULL UNIQUE,
  customer_id         uuid REFERENCES customer.customers(id),
  vendor_id           uuid NOT NULL REFERENCES vendor.vendors(id),
  status              text NOT NULL
                        CHECK (status IN ('pending_payment','paid','confirmed',
                                          'packed','out_for_delivery','delivered',
                                          'cancelled','refunded')),
  currency_code       char(3) NOT NULL DEFAULT 'KES',
  subtotal_minor      int NOT NULL,
  discount_minor      int NOT NULL DEFAULT 0,
  shipping_minor      int NOT NULL DEFAULT 0,
  tax_minor           int NOT NULL DEFAULT 0,
  total_minor         int NOT NULL,
  payment_status      text NOT NULL
                        CHECK (payment_status IN ('unpaid','pending','paid',
                                                  'failed','partially_refunded','refunded')),
  fulfillment_status  text NOT NULL DEFAULT 'unfulfilled',
  promo_id            uuid REFERENCES catalog.promotions(id),
  billing_address_id  uuid REFERENCES customer.addresses(id),
  shipping_address_id uuid REFERENCES customer.addresses(id),
  notes               text,
  placed_at           timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commerce.order_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid NOT NULL REFERENCES commerce.orders(id) ON DELETE CASCADE,
  variant_id          uuid REFERENCES catalog.product_variants(id),
  product_name        text NOT NULL,
  shade_name          text,
  finish_name         text,
  pack_size_ml        int,
  vendor_sku          text,
  quantity            int NOT NULL,
  unit_price_minor    int NOT NULL,
  line_discount_minor int NOT NULL DEFAULT 0,
  tax_minor           int NOT NULL DEFAULT 0,
  line_total_minor    int NOT NULL
);

CREATE TABLE IF NOT EXISTS commerce.order_status_history (
  id          bigserial PRIMARY KEY,
  order_id    uuid NOT NULL REFERENCES commerce.orders(id) ON DELETE CASCADE,
  from_status text,
  to_status   text NOT NULL,
  changed_by_type text CHECK (changed_by_type IN ('staff','system','vendor','customer')),
  changed_by_id   uuid,
  notes       text,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_customer_placed_idx ON commerce.orders (customer_id, placed_at DESC);
CREATE INDEX IF NOT EXISTS orders_vendor_status_placed_idx ON commerce.orders (vendor_id, status, placed_at DESC);
CREATE INDEX IF NOT EXISTS carts_customer_status_idx ON commerce.carts (customer_id, status);
CREATE INDEX IF NOT EXISTS carts_active_abandonment_idx ON commerce.carts (status, updated_at) WHERE status = 'active';

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3G — Payment schema
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment.payment_methods (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  provider      text NOT NULL
                  CHECK (provider IN ('mpesa','stripe','paystack','bank','cash')),
  country_code  char(2),
  currency_code char(3),
  display_name  text NOT NULL,
  is_enabled    boolean NOT NULL DEFAULT true,
  fee_type      text NOT NULL CHECK (fee_type IN ('flat','percent','hybrid')),
  fee_flat_minor int NOT NULL DEFAULT 0,
  fee_bps        int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payment.payment_attempts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid NOT NULL REFERENCES commerce.orders(id) ON DELETE CASCADE,
  payment_method_id   uuid NOT NULL REFERENCES payment.payment_methods(id),
  provider_reference  text,
  provider_request_id text,
  amount_minor        int NOT NULL,
  currency_code       char(3) NOT NULL,
  phone_e164          text,
  status              text NOT NULL
                        CHECK (status IN ('initiated','pending','success',
                                          'failed','cancelled','expired')),
  failure_reason      text,
  raw_request         jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_response        jsonb NOT NULL DEFAULT '{}'::jsonb,
  reconciled_at       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment.refunds (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             uuid NOT NULL REFERENCES commerce.orders(id),
  payment_attempt_id   uuid REFERENCES payment.payment_attempts(id),
  amount_minor         int NOT NULL,
  reason               text,
  status               text NOT NULL
                         CHECK (status IN ('requested','processing','succeeded','failed')),
  provider_reference   text,
  initiated_by_type    text CHECK (initiated_by_type IN ('staff','customer','system')),
  initiated_by_id      uuid,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment.legacy_mpesa_mapping (
  new_attempt_id  uuid NOT NULL REFERENCES payment.payment_attempts(id),
  legacy_row_id   uuid NOT NULL,
  migrated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_attempts_provider_ref_idx ON payment.payment_attempts (payment_method_id, provider_reference);
CREATE INDEX IF NOT EXISTS payment_attempts_order_status_idx ON payment.payment_attempts (order_id, status);
CREATE INDEX IF NOT EXISTS payment_attempts_pending_idx ON payment.payment_attempts (status, created_at) WHERE status = 'pending';

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3H — Delivery schema
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery.delivery_zones (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code                    char(2) NOT NULL DEFAULT 'KE',
  county_code                     text,
  subcounty_code                  text,
  locality                        text,
  zone_name                       text NOT NULL,
  base_fee_minor                  int NOT NULL DEFAULT 0,
  free_delivery_threshold_minor   int,
  estimated_days_min              int NOT NULL DEFAULT 1,
  estimated_days_max              int NOT NULL DEFAULT 3,
  is_active                       boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS delivery.shipments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid NOT NULL REFERENCES commerce.orders(id) ON DELETE CASCADE,
  delivery_zone_id  uuid REFERENCES delivery.delivery_zones(id),
  provider_type     text NOT NULL
                      CHECK (provider_type IN ('internal_fleet','third_party')),
  provider_name     text,
  tracking_number   text,
  status            text NOT NULL
                      CHECK (status IN ('pending','scheduled','picked',
                                        'in_transit','delivered','failed','returned')),
  scheduled_for     timestamptz,
  delivered_at      timestamptz,
  failure_reason    text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery.shipment_events (
  id           bigserial PRIMARY KEY,
  shipment_id  uuid NOT NULL REFERENCES delivery.shipments(id) ON DELETE CASCADE,
  event_type   text NOT NULL,
  description  text,
  location     text,
  occurred_at  timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3I — Search schema
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS search.product_documents (
  variant_id        uuid PRIMARY KEY REFERENCES catalog.product_variants(id) ON DELETE CASCADE,
  vendor_id         uuid NOT NULL,
  product_id        uuid NOT NULL,
  searchable_text   tsvector NOT NULL,
  filter_json       jsonb NOT NULL,
  ranking_features  jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_indexed_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_documents_search_idx
  ON search.product_documents USING gin (searchable_text);

CREATE INDEX IF NOT EXISTS product_documents_filters_idx
  ON search.product_documents USING gin (filter_json);

CREATE TABLE IF NOT EXISTS search.query_logs (
  id          bigserial PRIMARY KEY,
  customer_id uuid,
  session_id  text,
  query_text  text NOT NULL,
  result_count int,
  clicked_variant_id uuid,
  queried_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS query_logs_queried_at_desc_idx ON search.query_logs (queried_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3J — Analytics schema
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics.events (
  id           bigserial PRIMARY KEY,
  customer_id  uuid,
  session_id   text,
  event_name   text NOT NULL,
  page_path    text,
  entity_type  text,
  entity_id    uuid,
  event_ts     timestamptz NOT NULL DEFAULT now(),
  properties   jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS events_customer_ts_idx ON analytics.events (customer_id, event_ts DESC);
CREATE INDEX IF NOT EXISTS events_name_ts_idx ON analytics.events (event_name, event_ts DESC);
CREATE INDEX IF NOT EXISTS events_session_ts_idx ON analytics.events (session_id, event_ts);

CREATE TABLE IF NOT EXISTS analytics.funnel_snapshots (
  id              bigserial PRIMARY KEY,
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  funnel_stage    text NOT NULL,
  visitor_count   int NOT NULL DEFAULT 0,
  conversion_rate numeric(6,4),
  computed_at     timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3K — Integration schema
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integration.webhook_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system  text NOT NULL,
  event_type     text NOT NULL,
  external_id    text,
  idempotency_key text UNIQUE,
  payload        jsonb NOT NULL,
  received_at    timestamptz NOT NULL DEFAULT now(),
  processed_at   timestamptz,
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','processing','processed','failed','skipped')),
  error_message  text,
  retry_count    int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS integration.outbox_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type  text NOT NULL,
  aggregate_id    uuid NOT NULL,
  event_type      text NOT NULL,
  payload         jsonb NOT NULL,
  target_system   text NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','sent','failed')),
  scheduled_at    timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  error_message   text,
  retry_count     int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outbox_events_status_scheduled_idx ON integration.outbox_events (status, scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS webhook_events_lookup_idx ON integration.webhook_events (source_system, status, received_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3L — Regulatory schema
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS regulatory.tax_rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code   char(2) NOT NULL DEFAULT 'KE',
  category_code  text,
  product_type   text,
  tax_name       text NOT NULL,
  rate_bps       int NOT NULL,
  is_inclusive   boolean NOT NULL DEFAULT false,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to   timestamptz,
  is_active      boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS regulatory.vendor_compliance_records (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id      uuid NOT NULL REFERENCES vendor.vendors(id) ON DELETE CASCADE,
  record_type    text NOT NULL,
  record_value   text,
  verified_at    timestamptz,
  expires_at     timestamptz,
  is_current     boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS regulatory.tax_export_batches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end   date NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','generated','submitted','acknowledged')),
  file_key     text,
  total_tax_minor int,
  created_at   timestamptz NOT NULL DEFAULT now()
);
