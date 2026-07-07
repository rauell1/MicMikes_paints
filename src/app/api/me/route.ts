import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { sql } from "drizzle-orm";
import { auth } from "@/server/auth/session";
import { headers } from "next/headers";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const resource = searchParams.get("_r");

  // Retrieve current Better Auth session
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userEmail = session.user.email;

  try {
    /* ── 1. LIST ORDERS ── */
    if (resource === "orders") {
      const orders = (await db.execute(sql`
        SELECT o.id, o.total_minor / 100 AS total_kes, o.shipping_minor / 100 AS delivery_kes,
               o.status, o.placed_at AS created_at, o.order_number AS mpesa_ref,
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
        WHERE LOWER(cust.email) = LOWER(${userEmail})
        ORDER BY o.placed_at DESC
      `)).rows;

      return NextResponse.json({
        orders: orders.map(o => ({
          ...o,
          items: o.items ?? []
        }))
      });
    }

    /* ── 2. SINGLE ORDER DETAILS ── */
    if (resource === "order") {
      const id = searchParams.get("id");
      if (!id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
      }

      const rows = (await db.execute(sql`
        SELECT o.id, o.order_number, o.status, o.currency_code, 
               o.subtotal_minor / 100 AS subtotal_kes,
               o.shipping_minor / 100 AS delivery_kes, 
               o.total_minor / 100 AS total_kes, 
               o.placed_at AS created_at,
               addr.recipient_name AS name, 
               addr.recipient_phone_e164 AS phone, 
               addr.county_code AS county,
               addr.locality AS town, 
               addr.estate AS address,
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
        WHERE o.id = ${id} AND LOWER(cust.email) = LOWER(${userEmail})
        LIMIT 1
      `)).rows;

      if (rows.length === 0) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      return NextResponse.json({
        order: {
          ...rows[0],
          items: rows[0].items ?? []
        }
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[api/me] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
