import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { sql } from "drizzle-orm";
import { orderFormSchema, enquiryFormSchema, getFieldErrors, normaliseKenyanPhone } from "@/lib/validation";
import { sanitize, sanitizeEmail } from "@/lib/sanitize";

const DEFAULT_DELIVERY_FEE_MINOR = 0;
const SYSTEM_SHOWCASE_CUSTOMER_ID = "88d8bd7f-94d3-488f-a0bb-26aa77dd8e10";
const FIRST_PARTY_VENDOR_ID = "99b7ad4f-4d32-473d-88b0-51a8cc3f5ba0";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const rawPhone = String(searchParams.get("phone") ?? "").trim();
  const rawEmail = String(searchParams.get("email") ?? "").trim().toLowerCase();

  if (!rawPhone && !rawEmail) {
    return NextResponse.json({ error: "phone or email query param required" }, { status: 400 });
  }

  try {
    let orders: any[];
    if (rawPhone) {
      let phone: string;
      try { phone = normaliseKenyanPhone(rawPhone); }
      catch { return NextResponse.json({ error: "Invalid phone number" }, { status: 400 }); }

      orders = (await db.execute(sql`
        SELECT
          o.id,
          o.placed_at AS "created_at",
          o.status,
          o.total_minor / 100 AS "total_kes",
          o.shipping_minor / 100 AS "delivery_kes",
          addr.county_code AS "county",
          addr.locality AS "town",
          o.order_number AS "reference",
          COALESCE((
            SELECT SUM(pa.amount_minor) FROM payment.payment_attempts pa
            WHERE pa.order_id = o.id AND pa.status = 'success'
          ), 0) / 100 AS "paid_kes",
          (
            SELECT json_agg(json_build_object(
              'productSlug', p.slug,
              'colourName',  COALESCE(oi.shade_name, 'No colour'),
              'colourHex',   COALESCE(s.hex_value,  '#cccccc'),
              'size',        CASE WHEN oi.pack_size_ml = 1000 THEN '1L' WHEN oi.pack_size_ml = 4000 THEN '4L' ELSE '20L' END,
              'finish',      oi.finish_name,
              'quantity',    oi.quantity,
              'unitKes',     oi.unit_price_minor / 100
            ))
            FROM commerce.order_items oi
            LEFT JOIN catalog.product_variants pv ON pv.id = oi.variant_id
            LEFT JOIN catalog.products p ON p.id = pv.product_id
            LEFT JOIN catalog.shades s ON s.id = pv.shade_id
            WHERE oi.order_id = o.id
          ) AS items
        FROM commerce.orders o
        LEFT JOIN customer.addresses addr ON addr.id = o.shipping_address_id
        WHERE addr.recipient_phone_e164 = ${phone}
        ORDER BY o.placed_at DESC
        LIMIT 20
      `)).rows;
    } else {
      orders = (await db.execute(sql`
        SELECT
          o.id,
          o.placed_at AS "created_at",
          o.status,
          o.total_minor / 100 AS "total_kes",
          o.shipping_minor / 100 AS "delivery_kes",
          addr.county_code AS "county",
          addr.locality AS "town",
          o.order_number AS "reference",
          COALESCE((
            SELECT SUM(pa.amount_minor) FROM payment.payment_attempts pa
            WHERE pa.order_id = o.id AND pa.status = 'success'
          ), 0) / 100 AS "paid_kes",
          (
            SELECT json_agg(json_build_object(
              'productSlug', p.slug,
              'colourName',  COALESCE(oi.shade_name, 'No colour'),
              'colourHex',   COALESCE(s.hex_value,  '#cccccc'),
              'size',        CASE WHEN oi.pack_size_ml = 1000 THEN '1L' WHEN oi.pack_size_ml = 4000 THEN '4L' ELSE '20L' END,
              'finish',      oi.finish_name,
              'quantity',    oi.quantity,
              'unitKes',     oi.unit_price_minor / 100
            ))
            FROM commerce.order_items oi
            LEFT JOIN catalog.product_variants pv ON pv.id = oi.variant_id
            LEFT JOIN catalog.products p ON p.id = pv.product_id
            LEFT JOIN catalog.shades s ON s.id = pv.shade_id
            WHERE oi.order_id = o.id
          ) AS items
        FROM commerce.orders o
        LEFT JOIN customer.customers cust ON cust.id = o.customer_id
        LEFT JOIN customer.addresses addr ON addr.id = o.shipping_address_id
        WHERE LOWER(cust.email) = ${rawEmail}
        ORDER BY o.placed_at DESC
        LIMIT 20
      `)).rows;
    }

    const result = orders.map(o => ({
      ...o,
      items: o.items ?? []
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/orders] Lookup failed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Check if query type is enquiry
    const { searchParams } = req.nextUrl;
    if (searchParams.get("type") === "enquiry") {
      const validation = enquiryFormSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json({
          error: "Validation failed",
          errors: getFieldErrors(validation.error),
        }, { status: 400 });
      }
      const { name, email, phone, message } = validation.data;
      console.log("[enquiry]", { name: sanitize(name), email: sanitizeEmail(email), phone: normaliseKenyanPhone(phone), message: sanitize(message) });
      return NextResponse.json({ success: true, message: "Enquiry received. We will be in touch shortly!" });
    }

    const validation = orderFormSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({
        error: "Validation failed",
        errors: getFieldErrors(validation.error),
      }, { status: 400 });
    }

    const data    = validation.data;
    const name    = sanitize(data.name);
    const email   = sanitizeEmail(data.email);
    const phone   = normaliseKenyanPhone(data.phone);
    const county  = sanitize(data.county);
    const town    = data.town ? sanitize(data.town) : null;
    const address = sanitize(data.address);
    const notes   = data.notes ? sanitize(data.notes) : "";
    const items   = data.items;
    const latitude  = data.latitude ? Number(data.latitude) : null;
    const longitude = data.longitude ? Number(data.longitude) : null;
    const marketingOptIn = data.marketingOptIn ?? false;
    const analyticsConsent = data.analyticsConsent ?? false;

    /* ── 1. Look up Delivery Fee (read-only) ── */
    const deliveryFeeMinor = 0; // Forced to 0 (Sales Point Only)

    /* ── 4. Price Cart Items ── */
    const verified: {
      productId: string;
      variantId: string;
      productName: string;
      shadeId: string | null;
      shadeName: string | null;
      shadeHex: string | null;
      finish: string;
      sizeMl: number;
      quantity: number;
      unitPriceMinor: number;
      sku: string;
      enforced: boolean;
    }[] = [];

    const sizeMap: Record<string, number> = { "1L": 1000, "4L": 4000, "20L": 20000 };

    for (const item of items) {
      const sizeMl = sizeMap[item.size] || 4000;
      
      const rows = (await db.execute(sql`
        SELECT p.id AS product_id, p.name AS product_name, v.id AS variant_id, v.list_price_minor, v.sku,
               v.stock_tracking,
               COALESCE(ii.on_hand_qty, 0) AS on_hand_qty
        FROM catalog.products p
        JOIN catalog.product_variants v ON v.product_id = p.id AND v.pack_size_ml = ${sizeMl}
        LEFT JOIN catalog.inventory_items ii ON ii.variant_id = v.id
        WHERE p.slug = ${item.productSlug} AND p.status = 'active'
        LIMIT 1
      `)).rows;

      if (rows.length === 0) {
        return NextResponse.json({ error: `Unknown product or size: ${item.productSlug} ${item.size}` }, { status: 400 });
      }

      let shadeId: string | null = null;
      let shadeName: string | null = null;
      let shadeHex: string | null = null;

      if (item.colourId) {
        const shades = (await db.execute(sql`
          SELECT id, name, hex_value FROM catalog.shades WHERE id = ${item.colourId} LIMIT 1
        `)).rows;
        if (shades.length > 0) {
          shadeId = shades[0].id as string;
          shadeName = shades[0].name as string;
          shadeHex = shades[0].hex_value as string;
        }
      }

      verified.push({
        productId: rows[0].product_id as string,
        variantId: rows[0].variant_id as string,
        productName: rows[0].product_name as string,
        shadeId,
        shadeName,
        shadeHex,
        finish: sanitize(String(item.finish ?? "Matte")).slice(0, 30),
        sizeMl,
        quantity: item.quantity,
        unitPriceMinor: Number(rows[0].list_price_minor),
        sku: rows[0].sku as string,
        // Enforce stock only where it is actually configured: tracking on AND
        // a real on-hand quantity set. Variants left at 0 on-hand are treated
        // as untracked/made-to-order so the store isn't blocked before stock
        // is seeded via the admin Stock tab.
        enforced: Boolean(rows[0].stock_tracking) && Number(rows[0].on_hand_qty) > 0,
      });
    }

    /* ── Atomic stock reservation — prevents overselling under concurrency ──
       Each reservation is a single conditional UPDATE. Postgres takes a row
       lock on the inventory row, so concurrent order requests for the same
       variant serialize: each re-checks (on_hand - reserved) >= qty against
       the latest committed value. For the last unit, exactly one request
       succeeds; the rest match zero rows and are rejected. If a later line in
       a multi-item order is out of stock, the reservations already made in
       this request are released (compensation) before failing. ── */
    const reserved: { variantId: string; qty: number }[] = [];
    const releaseHeld = async () => {
      for (const r of reserved) {
        await db.execute(sql`
          UPDATE catalog.inventory_items
          SET reserved_qty = GREATEST(0, reserved_qty - ${r.qty}), updated_at = now()
          WHERE variant_id = ${r.variantId}
        `);
      }
    };
    for (const it of verified) {
      if (!it.enforced) continue;
      const got = (await db.execute(sql`
        UPDATE catalog.inventory_items
        SET reserved_qty = reserved_qty + ${it.quantity}, updated_at = now()
        WHERE variant_id = ${it.variantId}
          AND (on_hand_qty - reserved_qty) >= ${it.quantity}
        RETURNING variant_id
      `)).rows;

      if (got.length === 0) {
        await releaseHeld();
        return NextResponse.json(
          { error: `Sorry, "${it.productName}" just sold out. Please update your cart and try again.`, soldOutVariantId: it.variantId },
          { status: 409 }
        );
      }
      reserved.push({ variantId: it.variantId, qty: it.quantity });
    }

    // Reservation succeeded. Everything below is a write; wrap it so any
    // failure releases the held stock — a failed order never leaks a hold,
    // and a sold-out/invalid attempt (handled above) never created a customer,
    // address, or order row.
    try {
    /* ── Create or find customer ── */
    let customerId: string;
    const existing = (await db.execute(sql`
      SELECT id FROM customer.customers
      WHERE email = ${email} OR phone_e164 = ${phone}
      LIMIT 1
    `)).rows;

    if (existing.length > 0) {
      customerId = existing[0].id as string;
      await db.execute(sql`
        UPDATE customer.customers
        SET full_name = COALESCE(NULLIF(${name}, ''), full_name),
            phone_e164 = COALESCE(NULLIF(${phone}, ''), phone_e164),
            marketing_opt_in = ${marketingOptIn},
            analytics_consent = ${analyticsConsent},
            updated_at = now()
        WHERE id = ${customerId}
      `);
    } else {
      const inserted = (await db.execute(sql`
        INSERT INTO customer.customers (email, phone_e164, full_name, status, marketing_opt_in, analytics_consent)
        VALUES (${email}, ${phone}, ${name}, 'active', ${marketingOptIn}, ${analyticsConsent})
        RETURNING id
      `)).rows;
      customerId = inserted[0].id as string;
    }

    /* ── Create shipping address ── */
    const addrRow = (await db.execute(sql`
      INSERT INTO customer.addresses (customer_id, recipient_name, recipient_phone_e164, county_code, locality, estate, latitude, longitude, is_default)
      VALUES (${customerId}, ${name}, ${phone}, ${county}, ${town}, ${address}, ${latitude}, ${longitude}, true)
      RETURNING id
    `)).rows;
    const addressId = addrRow[0].id as string;

    const subtotalMinor = verified.reduce((s, i) => s + i.unitPriceMinor * i.quantity, 0);
    const totalMinor    = subtotalMinor + deliveryFeeMinor;

    // Kenyan VAT is 16% inclusive
    const taxMinor = Math.round(totalMinor * 16.0 / 116.0);

    /* ── 5. Generate Sequential Order Number ── */
    const orderUuid = crypto.randomUUID();
    const d = new Date();
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const randPart = orderUuid.slice(-4).toUpperCase();
    const orderNumber = `MMK-${dateStr}-${randPart}`;

    /* ── 6. Create Order ── */
    const orderRow = (await db.execute(sql`
      INSERT INTO commerce.orders
        (id, order_number, customer_id, vendor_id, status, currency_code,
         subtotal_minor, discount_minor, shipping_minor, tax_minor, total_minor,
         payment_status, fulfillment_status, shipping_address_id, billing_address_id, notes)
      VALUES
        (${orderUuid}, ${orderNumber}, ${customerId}, ${FIRST_PARTY_VENDOR_ID}, 'pending_payment', 'KES',
         ${subtotalMinor}, 0, ${deliveryFeeMinor}, ${taxMinor}, ${totalMinor},
         'unpaid', 'unfulfilled', ${addressId}, ${addressId}, ${notes})
      RETURNING id, placed_at
    `)).rows;

    for (const item of verified) {
      await db.execute(sql`
        INSERT INTO commerce.order_items
          (order_id, variant_id, product_name, shade_name, finish_name, pack_size_ml, vendor_sku,
           quantity, unit_price_minor, line_discount_minor, tax_minor, line_total_minor, reserved_qty)
        VALUES
          (${orderUuid}, ${item.variantId}, ${item.productName}, ${item.shadeName}, ${item.finish}, ${item.sizeMl}, ${item.sku},
           ${item.quantity}, ${item.unitPriceMinor}, 0, 0, ${item.unitPriceMinor * item.quantity},
           ${item.enforced ? item.quantity : 0})
      `);
    }

    // Record status history
    await db.execute(sql`
      INSERT INTO commerce.order_status_history (order_id, from_status, to_status, changed_by_type, notes)
      VALUES (${orderUuid}, NULL, 'pending_payment', 'customer', 'Order placed via checkout')
    `);

    return NextResponse.json({
      orderId: orderUuid,
      reference: orderNumber,
      subtotalKes: subtotalMinor / 100,
      deliveryKes: deliveryFeeMinor / 100,
      totalKes: totalMinor / 100,
    }, { status: 201 });

    } catch (inner) {
      // A write failed after stock was reserved — release the hold, then let
      // the outer handler return the 500.
      await releaseHeld();
      throw inner;
    }

  } catch (err) {
    console.error("[api/orders] Checkout failed:", err);
    return NextResponse.json({ error: "An unexpected error occurred. Please try again." }, { status: 500 });
  }
}
