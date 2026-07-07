import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { sql } from "drizzle-orm";
import crypto from "crypto";
import { cookies } from "next/headers";

const COOKIE = "mm-admin-token";
const cookieOpts = "HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400";
const SYSTEM_SHOWCASE_CUSTOMER_ID = "88d8bd7f-94d3-488f-a0bb-26aa77dd8e10";
const FIRST_PARTY_VENDOR_ID = "99b7ad4f-4d32-473d-88b0-51a8cc3f5ba0";

function signToken(secret: string): string {
  const payload = String(Date.now());
  const sig = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

function verifyToken(token: string | undefined, secret: string): boolean {
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const lastDot = decoded.lastIndexOf(".");
    if (lastDot === -1) return false;
    const payload = decoded.slice(0, lastDot);
    const sig = decoded.slice(lastDot + 1);
    const expected = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    const ts = parseInt(payload, 10);
    return sig === expected && Date.now() - ts < 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  return verifyToken(token, process.env.ADMIN_JWT_SECRET || "default_secret");
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const resource = searchParams.get("_r");

  /* ── 1. LOGIN STATUS CHECK (no full auth required) ── */
  if (resource === "login") {
    const authorized = await isAuthorized(req);
    return authorized
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  /* ── All other resources require auth ── */
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    /* ── 2. DASHBOARD TAB ── */
    if (resource === "dashboard") {
      const [
        revRows,
        statusRows,
        topProductRows,
        slowRows,
        recentRows,
        mpesaRows,
        countyRows,
      ] = await Promise.all([
        /* Revenue calculations */
        db.execute(sql`
          SELECT
            COALESCE(SUM(CASE WHEN placed_at >= date_trunc('day',   now() AT TIME ZONE 'Africa/Nairobi') THEN total_minor END), 0)::int / 100 AS today,
            COALESCE(SUM(CASE WHEN placed_at >= date_trunc('week',  now() AT TIME ZONE 'Africa/Nairobi') THEN total_minor END), 0)::int / 100 AS this_week,
            COALESCE(SUM(CASE WHEN placed_at >= date_trunc('month', now() AT TIME ZONE 'Africa/Nairobi') THEN total_minor END), 0)::int / 100 AS this_month,
            COALESCE(SUM(total_minor), 0)::int / 100 AS all_time,
            COUNT(*)::int AS total_orders,
            COALESCE(ROUND(AVG(total_minor)::numeric, 0), 0)::int / 100 AS avg_order_value
          FROM commerce.orders
          WHERE status NOT IN ('cancelled')
        `),
        /* Orders by status */
        db.execute(sql`
          SELECT status, COUNT(*)::int AS count
          FROM commerce.orders
          GROUP BY status
          ORDER BY count DESC
        `),
        /* Top products (last 90 days) */
        db.execute(sql`
          SELECT
            oi.product_name AS name,
            p.slug,
            '' AS image_url,
            p.category_id::text AS category,
            SUM(oi.quantity)::int AS units_sold,
            (SUM(oi.quantity * oi.unit_price_minor) / 100)::int AS revenue_kes,
            COUNT(DISTINCT oi.order_id)::int AS order_count
          FROM commerce.order_items oi
          JOIN commerce.orders o ON o.id = oi.order_id
          LEFT JOIN catalog.product_variants pv ON pv.id = oi.variant_id
          LEFT JOIN catalog.products p ON p.id = pv.product_id
          WHERE o.placed_at >= now() - interval '90 days'
            AND o.status NOT IN ('cancelled')
          GROUP BY oi.product_name, p.slug, p.category_id
          ORDER BY units_sold DESC
          LIMIT 8
        `),
        /* Slow movers */
        db.execute(sql`
          SELECT p.name, p.slug, p.category_id::text AS category, '' AS image_url,
            MAX(o.placed_at) AS last_ordered
          FROM catalog.products p
          LEFT JOIN catalog.product_variants pv ON pv.product_id = p.id
          LEFT JOIN commerce.order_items oi ON oi.variant_id = pv.id
          LEFT JOIN commerce.orders o ON o.id = oi.order_id AND o.status NOT IN ('cancelled')
          GROUP BY p.id, p.name, p.slug, p.category_id
          HAVING MAX(o.placed_at) IS NULL OR MAX(o.placed_at) < now() - interval '60 days'
          ORDER BY last_ordered ASC NULLS FIRST
          LIMIT 8
        `),
        /* Recent orders */
        db.execute(sql`
          SELECT
            o.id,
            addr.recipient_name AS name,
            cust.email,
            addr.recipient_phone_e164 AS phone,
            addr.county_code AS county,
            addr.locality AS town,
            o.total_minor / 100 AS total_kes,
            o.status,
            o.order_number AS mpesa_ref,
            o.placed_at AS created_at
          FROM commerce.orders o
          LEFT JOIN customer.customers cust ON cust.id = o.customer_id
          LEFT JOIN customer.addresses addr ON addr.id = o.shipping_address_id
          WHERE NOT (o.status = 'pending_payment' AND o.placed_at < now() - INTERVAL '24 hours')
          ORDER BY o.placed_at DESC
          LIMIT 10
        `),
        /* M-Pesa success rate */
        db.execute(sql`
          SELECT
            COUNT(*)::int AS total,
            COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0)::int AS success,
            COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0)::int AS cancelled,
            COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0)::int AS failed
          FROM payment.payment_attempts
          WHERE created_at >= now() - interval '30 days'
        `),
        /* County breakdown */
        db.execute(sql`
          SELECT addr.county_code AS county, COUNT(*)::int AS orders, (SUM(o.total_minor) / 100)::int AS revenue_kes
          FROM commerce.orders o
          JOIN customer.addresses addr ON addr.id = o.shipping_address_id
          WHERE o.status NOT IN ('cancelled')
          GROUP BY addr.county_code
          ORDER BY revenue_kes DESC
          LIMIT 8
        `),
      ]);

      return NextResponse.json({
        revenue: revRows.rows[0] ?? {},
        byStatus: statusRows.rows,
        topProducts: topProductRows.rows,
        slowMovers: slowRows.rows,
        recentOrders: recentRows.rows,
        mpesa: mpesaRows.rows[0] ?? { total: 0, success: 0, cancelled: 0, failed: 0 },
        byCounty: countyRows.rows,
      });
    }

    /* ── 3. CUSTOMERS TAB ── */
    if (resource === "customers") {
      const rows = await db.execute(sql`
        SELECT
          c.id::text AS id,
          c.full_name AS name,
          c.email,
          c.phone_e164 AS phone,
          MAX(addr.county_code) AS county,
          MAX(addr.locality) AS town,
          COUNT(o.id)::int AS order_count,
          COALESCE(SUM(CASE WHEN o.status NOT IN ('cancelled') THEN o.total_minor ELSE 0 END), 0)::int / 100 AS total_spent_kes,
          MAX(o.placed_at) AS last_order_at
        FROM customer.customers c
        LEFT JOIN customer.addresses addr ON addr.customer_id = c.id
        LEFT JOIN commerce.orders o ON o.customer_id = c.id
        GROUP BY c.id, c.full_name, c.email, c.phone_e164
        ORDER BY total_spent_kes DESC
        LIMIT 500
      `);
      return NextResponse.json(rows.rows);
    }

    /* ── 4. STOCK TAB ── */
    if (resource === "stock") {
      const rows = await db.execute(sql`
        SELECT
          ii.variant_id AS id,
          pv.product_id,
          p.name AS product_name,
          p.slug AS product_slug,
          CASE WHEN pv.pack_size_ml = 1000 THEN '1L' WHEN pv.pack_size_ml = 4000 THEN '4L' ELSE '20L' END AS size,
          pv.shade_id AS colour_id,
          s.name AS colour_name,
          ii.on_hand_qty AS stock,
          ii.reorder_level AS low_stock_threshold
        FROM catalog.inventory_items ii
        JOIN catalog.product_variants pv ON pv.id = ii.variant_id
        JOIN catalog.products p ON p.id = pv.product_id
        LEFT JOIN catalog.shades s ON s.id = pv.shade_id
        ORDER BY p.name, pv.pack_size_ml, s.name NULLS LAST
      `);
      return NextResponse.json(rows.rows);
    }

    /* ── 5. DELIVERY RATES TAB ── */
    if (resource === "delivery-rates") {
      const rows = await db.execute(sql`
        SELECT id, county_code AS county, locality AS town, base_fee_minor / 100 AS rate_kes, estimated_days_min, estimated_days_max, is_active
        FROM delivery.delivery_zones
        ORDER BY county_code ASC, locality ASC NULLS LAST
      `);
      return NextResponse.json(rows.rows);
    }

    /* ── 6. COLOURS TAB ── */
    if (resource === "colours") {
      const rows = await db.execute(sql`
        SELECT s.id, s.code, s.name, s.hex_value AS hex, f.name AS family
        FROM catalog.shades s
        LEFT JOIN catalog.colour_families f ON f.id = s.family_id
        ORDER BY f.name, s.name
      `);
      return NextResponse.json(rows.rows);
    }

    /* ── 7. PRODUCTS TAB ── */
    if (resource === "products") {
      const rows = await db.execute(sql`
        SELECT p.id, p.slug, p.name, p.short_description AS blurb, p.product_type AS category, COALESCE(MAX(m.cdn_url), '') AS image_url,
          COALESCE(
            json_agg(
              json_build_object(
                'id', v.id,
                'size', CASE WHEN v.pack_size_ml = 1000 THEN '1L' WHEN v.pack_size_ml = 4000 THEN '4L' ELSE '20L' END,
                'price_kes', v.list_price_minor / 100
              ) ORDER BY v.pack_size_ml
            ) FILTER (WHERE v.id IS NOT NULL),
            '[]'::json
          ) AS variants
        FROM catalog.products p
        LEFT JOIN catalog.product_variants v ON v.product_id = p.id
        LEFT JOIN catalog.media_assets m ON m.owner_type = 'product' AND m.owner_id = p.id
        GROUP BY p.id
        ORDER BY p.product_type, p.name
      `);
      return NextResponse.json(rows.rows);
    }

    /* ── 8. ROOMS TAB ── */
    if (resource === "rooms") {
      const rows = await db.execute(sql`
        SELECT r.id, r.room_name AS name, m.cdn_url AS photo_url, m.storage_key AS wall_mask, 10 AS sort_order
        FROM customer.saved_rooms r
        LEFT JOIN catalog.media_assets m ON m.id = r.media_id
        WHERE r.customer_id = ${SYSTEM_SHOWCASE_CUSTOMER_ID}
        ORDER BY r.created_at
      `);
      return NextResponse.json(rows.rows);
    }

    /* ── 9. ORDERS & UNRESOLVED TABS ── */
    if (resource === "orders" || resource === "unresolved") {
      // Automatically delete unresolved orders older than 30 days
      await db.execute(sql`
        DELETE FROM commerce.orders
        WHERE status = 'pending_payment' AND placed_at < now() - INTERVAL '30 days'
      `);

      const query = resource === "orders"
        ? sql`
            SELECT
              o.id,
              addr.recipient_name AS name,
              cust.email,
              addr.recipient_phone_e164 AS phone,
              addr.county_code AS county,
              addr.locality AS town,
              addr.estate AS address,
              o.subtotal_minor / 100 AS subtotal_kes,
              o.shipping_minor / 100 AS delivery_kes,
              o.total_minor / 100 AS total_kes,
              o.status,
              o.order_number AS mpesa_ref,
              o.placed_at AS created_at
            FROM commerce.orders o
            LEFT JOIN customer.customers cust ON cust.id = o.customer_id
            LEFT JOIN customer.addresses addr ON addr.id = o.shipping_address_id
            WHERE NOT (o.status = 'pending_payment' AND o.placed_at < now() - INTERVAL '24 hours')
            ORDER BY o.placed_at DESC
            LIMIT 200
          `
        : sql`
            SELECT
              o.id,
              addr.recipient_name AS name,
              cust.email,
              addr.recipient_phone_e164 AS phone,
              addr.county_code AS county,
              addr.locality AS town,
              addr.estate AS address,
              o.subtotal_minor / 100 AS subtotal_kes,
              o.shipping_minor / 100 AS delivery_kes,
              o.total_minor / 100 AS total_kes,
              o.status,
              o.order_number AS mpesa_ref,
              o.placed_at AS created_at
            FROM commerce.orders o
            LEFT JOIN customer.customers cust ON cust.id = o.customer_id
            LEFT JOIN customer.addresses addr ON addr.id = o.shipping_address_id
            WHERE o.status = 'pending_payment' AND o.placed_at < now() - INTERVAL '24 hours'
            ORDER BY o.placed_at DESC
            LIMIT 200
          `;

      const orders = (await db.execute(query)).rows;

      if (!orders.length) return NextResponse.json([]);

      const orderIds = orders.map((o) => o.id);
      const items = (await db.execute(sql`
        SELECT
          oi.order_id,
          p.slug AS product_slug,
          oi.product_name,
          CASE WHEN oi.pack_size_ml = 1000 THEN '1L' WHEN oi.pack_size_ml = 4000 THEN '4L' ELSE '20L' END AS size,
          oi.finish_name AS finish,
          oi.quantity,
          oi.unit_price_minor / 100 AS unit_kes,
          oi.shade_name AS colour_name,
          s.hex_value AS colour_hex
        FROM commerce.order_items oi
        LEFT JOIN catalog.product_variants pv ON pv.id = oi.variant_id
        LEFT JOIN catalog.products p ON p.id = pv.product_id
        LEFT JOIN catalog.shades s ON s.id = pv.shade_id
        WHERE oi.order_id IN ${orderIds}
      `)).rows;

      const itemsByOrder = items.reduce<Record<string, any[]>>((acc, item) => {
        const oid = String(item.order_id);
        (acc[oid] ??= []).push(item);
        return acc;
      }, {});

      const result = orders.map((o) => ({
        ...o,
        items: itemsByOrder[String(o.id)] ?? [],
      }));

      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown resource" }, { status: 404 });
  } catch (err) {
    console.error(`[api/admin] GET failed for resource ${resource}:`, err);
    return NextResponse.json({ error: "Database operation failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const resource = searchParams.get("_r");

  /* ── 1. ADMIN LOGIN ── */
  if (resource === "login") {
    try {
      const { password } = await req.json();
      if (!password || password !== process.env.ADMIN_PASSWORD) {
        return NextResponse.json({ error: "Invalid password" }, { status: 401 });
      }

      const token = signToken(process.env.ADMIN_JWT_SECRET || "default_secret");
      const cookieVal = `${COOKIE}=${token}; ${cookieOpts}`;
      
      const response = NextResponse.json({ ok: true });
      response.headers.set("Set-Cookie", cookieVal);
      return response;
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
  }

  /* ── All other resources require auth ── */
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    if (resource === "colours") {
      const { code, name, hex, family } = body;
      
      // Look up family
      const families = (await db.execute(sql`
        SELECT id FROM catalog.colour_families WHERE LOWER(name) = LOWER(${family}) LIMIT 1
      `)).rows;
      let familyId = families.length > 0 ? families[0].id : null;
      if (!familyId) {
        // Auto create family
        const newFam = (await db.execute(sql`
          INSERT INTO catalog.colour_families (code, name)
          VALUES (UPPER(${family}), ${family})
          RETURNING id
        `)).rows;
        familyId = newFam[0].id;
      }

      const row = (await db.execute(sql`
        INSERT INTO catalog.shades (code, name, hex_value, family_id, is_active)
        VALUES (${code}, ${name}, ${hex}, ${familyId}, true)
        RETURNING id, code, name, hex_value AS hex, ${family} AS family
      `)).rows[0];
      return NextResponse.json(row, { status: 201 });
    }

    if (resource === "products") {
      const { slug, name, blurb, category } = body;
      const prod = (await db.execute(sql`
        INSERT INTO catalog.products (vendor_id, slug, name, short_description, product_type, status)
        VALUES (${FIRST_PARTY_VENDOR_ID}, ${slug}, ${name}, ${blurb}, ${category}, 'active')
        RETURNING id, slug, name, short_description AS blurb, product_type AS category, '' AS image_url
      `)).rows[0] as any;

      // Auto create variants and inventory items
      const sizes = [1000, 4000, 20000];
      for (const size of sizes) {
        const variantId = crypto.randomUUID();
        const sku = `SKU-${prod.slug.toUpperCase()}-${size === 1000 ? '1L' : size === 4000 ? '4L' : '20L'}`;
        await db.execute(sql`
          INSERT INTO catalog.product_variants (id, product_id, pack_size_ml, sku, list_price_minor)
          VALUES (${variantId}, ${prod.id}, ${size}, ${sku}, 0)
        `);
        await db.execute(sql`
          INSERT INTO catalog.inventory_items (variant_id, on_hand_qty, reserved_qty)
          VALUES (${variantId}, 0, 0)
        `);
      }

      return NextResponse.json(prod, { status: 201 });
    }

    if (resource === "rooms") {
      const { name, photo_url, wall_mask } = body;
      // Showcase rooms are customer.saved_rooms owned by showcase customer
      const mediaId = crypto.randomUUID();
      await db.execute(sql`
        INSERT INTO catalog.media_assets (id, owner_type, owner_id, media_kind, storage_key, cdn_url, mime_type, moderation_status)
        VALUES (${mediaId}, 'customer_room', ${SYSTEM_SHOWCASE_CUSTOMER_ID}, 'image', ${wall_mask || photo_url}, ${photo_url}, 'image/jpeg', 'approved')
      `);
      const row = (await db.execute(sql`
        INSERT INTO customer.saved_rooms (customer_id, room_name, room_type, media_id)
        VALUES (${SYSTEM_SHOWCASE_CUSTOMER_ID}, ${name}, 'showcase', ${mediaId})
        RETURNING id, room_name AS name, ${photo_url} AS photo_url, ${wall_mask} AS wall_mask, 10 AS sort_order
      `)).rows[0];
      return NextResponse.json(row, { status: 201 });
    }

    if (resource === "delivery-rates") {
      const { county, town, rate_kes } = body;
      const rateMinor = Math.round(Number(rate_kes) * 100);
      const row = (await db.execute(sql`
        INSERT INTO delivery.delivery_zones (county_code, locality, base_fee_minor, zone_name)
        VALUES (${county.trim()}, ${town?.trim() || null}, ${rateMinor}, ${county.trim()})
        RETURNING id, county_code AS county, locality AS town, base_fee_minor / 100 AS rate_kes
      `)).rows[0];
      return NextResponse.json(row);
    }

    return NextResponse.json({ error: "Unknown resource" }, { status: 404 });
  } catch (err) {
    console.error(`[api/admin] POST failed for resource ${resource}:`, err);
    return NextResponse.json({ error: "Write operation failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const resource = searchParams.get("_r");

  try {
    const body = await req.json();

    if (resource === "stock") {
      const id = (searchParams.get("id") || body?.id) as string | undefined;
      if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
      const { stock, low_stock_threshold } = body;

      if (stock !== undefined && low_stock_threshold !== undefined) {
        await db.execute(sql`UPDATE catalog.inventory_items SET on_hand_qty=${stock}, reorder_level=${low_stock_threshold}, updated_at=now() WHERE variant_id=${id}`);
      } else if (stock !== undefined) {
        await db.execute(sql`UPDATE catalog.inventory_items SET on_hand_qty=${stock}, updated_at=now() WHERE variant_id=${id}`);
      } else if (low_stock_threshold !== undefined) {
        await db.execute(sql`UPDATE catalog.inventory_items SET reorder_level=${low_stock_threshold}, updated_at=now() WHERE variant_id=${id}`);
      }

      const updated = (await db.execute(sql`
        SELECT
          ii.variant_id AS id, pv.product_id, p.name AS product_name, p.slug AS product_slug,
          CASE WHEN pv.pack_size_ml = 1000 THEN '1L' WHEN pv.pack_size_ml = 4000 THEN '4L' ELSE '20L' END AS size,
          pv.shade_id AS colour_id, s.name AS colour_name, ii.on_hand_qty AS stock, ii.reorder_level AS low_stock_threshold
        FROM catalog.inventory_items ii
        JOIN catalog.product_variants pv ON pv.id = ii.variant_id
        JOIN catalog.products p ON p.id = pv.product_id
        LEFT JOIN catalog.shades s ON s.id = pv.shade_id
        WHERE ii.variant_id = ${id}
      `)).rows[0];
      return NextResponse.json(updated);
    }

    if (resource === "colours") {
      const { id, code, name, hex, family } = body;
      const families = (await db.execute(sql`
        SELECT id FROM catalog.colour_families WHERE LOWER(name) = LOWER(${family}) LIMIT 1
      `)).rows;
      let familyId = families.length > 0 ? families[0].id : null;
      if (!familyId) {
        const newFam = (await db.execute(sql`INSERT INTO catalog.colour_families (code, name) VALUES (UPPER(${family}), ${family}) RETURNING id`)).rows;
        familyId = newFam[0].id;
      }
      const row = (await db.execute(sql`
        UPDATE catalog.shades SET code=${code}, name=${name}, hex_value=${hex}, family_id=${familyId}
        WHERE id=${id}
        RETURNING id, code, name, hex_value AS hex, ${family} AS family
      `)).rows[0];
      return NextResponse.json(row);
    }

    if (resource === "products") {
      const { id, slug, name, blurb, category } = body;
      const row = (await db.execute(sql`
        UPDATE catalog.products SET slug=${slug}, name=${name}, short_description=${blurb}, product_type=${category}
        WHERE id=${id}
        RETURNING id, slug, name, short_description AS blurb, product_type AS category, '' AS image_url
      `)).rows[0];
      return NextResponse.json(row);
    }

    if (resource === "variants") {
      const { id, price_kes } = body;
      const priceMinor = Math.round(Number(price_kes) * 100);
      const row = (await db.execute(sql`
        UPDATE catalog.product_variants SET list_price_minor=${priceMinor}
        WHERE id=${id}
        RETURNING id, product_id, CASE WHEN pack_size_ml = 1000 THEN '1L' WHEN pack_size_ml = 4000 THEN '4L' ELSE '20L' END AS size, list_price_minor / 100 AS price_kes
      `)).rows[0];
      return NextResponse.json(row);
    }

    if (resource === "rooms") {
      const { id, name, photo_url, wall_mask } = body;
      const rooms = (await db.execute(sql`SELECT media_id FROM customer.saved_rooms WHERE id=${id} LIMIT 1`)).rows;
      if (rooms.length > 0) {
        const mediaId = rooms[0].media_id;
        await db.execute(sql`UPDATE catalog.media_assets SET cdn_url=${photo_url}, storage_key=${wall_mask || photo_url} WHERE id=${mediaId}`);
      }
      const row = (await db.execute(sql`
        UPDATE customer.saved_rooms SET room_name=${name} WHERE id=${id}
        RETURNING id, room_name AS name, ${photo_url} AS photo_url, ${wall_mask} AS wall_mask, 10 AS sort_order
      `)).rows[0];
      return NextResponse.json(row);
    }

    if (resource === "delivery-rates") {
      const { id, county, town, rate_kes } = body;
      const rateMinor = Math.round(Number(rate_kes) * 100);
      const row = (await db.execute(sql`
        UPDATE delivery.delivery_zones
        SET county_code=${county.trim()}, locality=${town?.trim() || null}, base_fee_minor=${rateMinor}
        WHERE id=${id}
        RETURNING id, county_code AS county, locality AS town, base_fee_minor / 100 AS rate_kes
      `)).rows[0];
      return NextResponse.json(row);
    }

    if (resource === "orders") {
      const { id, status } = body;
      const allowed = ["pending_payment", "paid", "confirmed", "packed", "out_for_delivery", "delivered", "cancelled", "refunded"];
      if (!allowed.includes(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      
      const prevStatus = (await db.execute(sql`SELECT status FROM commerce.orders WHERE id=${id}`)).rows[0]?.status;

      const row = (await db.execute(sql`
        UPDATE commerce.orders SET status=${status} WHERE id=${id} RETURNING id, status
      `)).rows[0];

      // Update order status history
      await db.execute(sql`
        INSERT INTO commerce.order_status_history (order_id, from_status, to_status, changed_by_type, notes)
        VALUES (${id}, ${prevStatus || null}, ${status}, 'staff', 'Status updated by admin')
      `);

      return NextResponse.json(row);
    }

    return NextResponse.json({ error: "Unknown resource" }, { status: 404 });
  } catch (err) {
    console.error(`[api/admin] PUT failed for resource ${resource}:`, err);
    return NextResponse.json({ error: "Update operation failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const resource = searchParams.get("_r");

  /* ── 1. LOG OUT ── */
  if (resource === "login") {
    const cookieVal = `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
    const response = NextResponse.json({ ok: true });
    response.headers.set("Set-Cookie", cookieVal);
    return response;
  }

  /* ── All other resources require auth ── */
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    if (resource === "colours") {
      await db.execute(sql`DELETE FROM catalog.shades WHERE id=${id}`);
      return NextResponse.json({ ok: true });
    }

    if (resource === "products") {
      await db.execute(sql`DELETE FROM catalog.product_variants WHERE product_id=${id}`);
      await db.execute(sql`DELETE FROM catalog.products WHERE id=${id}`);
      return NextResponse.json({ ok: true });
    }

    if (resource === "rooms") {
      const rooms = (await db.execute(sql`SELECT media_id FROM customer.saved_rooms WHERE id=${id} LIMIT 1`)).rows;
      await db.execute(sql`DELETE FROM customer.saved_rooms WHERE id=${id}`);
      if (rooms.length > 0) {
        await db.execute(sql`DELETE FROM catalog.media_assets WHERE id=${rooms[0].media_id}`);
      }
      return NextResponse.json({ ok: true });
    }

    if (resource === "delivery-rates") {
      await db.execute(sql`DELETE FROM delivery.delivery_zones WHERE id=${id}`);
      return NextResponse.json(null, { status: 204 });
    }

    return NextResponse.json({ error: "Unknown resource" }, { status: 404 });
  } catch (err) {
    console.error(`[api/admin] DELETE failed for resource ${resource}:`, err);
    return NextResponse.json({ error: "Delete operation failed" }, { status: 500 });
  }
}
