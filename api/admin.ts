import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

/* ─────────────────────────────────────────────────────────────────────────────
   AUTH  (HMAC-signed, cookie-based, 24-hour session)
───────────────────────────────────────────────────────────────────────────── */
function signToken(): string {
  const payload = String(Date.now());
  const sig = crypto
    .createHmac("sha256", process.env.ADMIN_JWT_SECRET!)
    .update(payload)
    .digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const lastDot = decoded.lastIndexOf(".");
    const payload = decoded.slice(0, lastDot);
    const sig = decoded.slice(lastDot + 1);
    const expected = crypto
      .createHmac("sha256", process.env.ADMIN_JWT_SECRET!)
      .update(payload)
      .digest("hex");
    const sigBuf = Buffer.from(sig, "hex");
    const expBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expBuf.length || sigBuf.length === 0) return false;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;
    const ts = parseInt(payload, 10);
    return !isNaN(ts) && Date.now() - ts < 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

const COOKIE = "mm-admin-token";
const cookieOpts = "HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400";

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN HANDLER
   Route key: ?_r=<resource>
   Resources: login | dashboard | customers | stock | delivery-rates |
              colours | products | variants | rooms | orders
───────────────────────────────────────────────────────────────────────────── */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const resource = req.query._r as string | undefined;

  /* ── LOGIN (no auth required) ─────────────────────────────────────────── */
  if (resource === "login") {
    if (req.method === "GET") {
      return verifyToken(req.cookies?.[COOKIE] as string | undefined)
        ? res.json({ ok: true })
        : res.status(401).json({ error: "Unauthorized" });
    }
    if (req.method === "POST") {
      const { password } = req.body ?? {};
      if (!password || password !== process.env.ADMIN_PASSWORD)
        return res.status(401).json({ error: "Invalid password" });
      const token = signToken();
      res.setHeader("Set-Cookie", `${COOKIE}=${token}; ${cookieOpts}`);
      return res.json({ ok: true });
    }
    if (req.method === "DELETE") {
      res.setHeader(
        "Set-Cookie",
        `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`
      );
      return res.json({ ok: true });
    }
    return res.status(405).end();
  }

  /* ── All other resources require auth ────────────────────────────────── */
  if (!verifyToken(req.cookies?.[COOKIE] as string | undefined))
    return res.status(401).json({ error: "Unauthorized" });

  const sql = neon(process.env.DATABASE_URL!);

  /* ── DASHBOARD ──────────────────────────────────────────────────────────
     Merged from api/admin/dashboard.ts
  ───────────────────────────────────────────────────────────────────────── */
  if (resource === "dashboard") {
    if (req.method !== "GET") return res.status(405).end();
    const [
      revRows,
      statusRows,
      topProductRows,
      slowRows,
      recentRows,
      mpesaRows,
      countyRows,
    ] = await Promise.all([
      /* 1 — Revenue: today, this week, this month, all time */
      sql`
        SELECT
          COALESCE(SUM(CASE WHEN created_at >= date_trunc('day',   now() AT TIME ZONE 'Africa/Nairobi') THEN total_kes END), 0) AS today,
          COALESCE(SUM(CASE WHEN created_at >= date_trunc('week',  now() AT TIME ZONE 'Africa/Nairobi') THEN total_kes END), 0) AS this_week,
          COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', now() AT TIME ZONE 'Africa/Nairobi') THEN total_kes END), 0) AS this_month,
          COALESCE(SUM(total_kes), 0) AS all_time,
          COUNT(*) AS total_orders,
          ROUND(AVG(total_kes)::numeric, 0) AS avg_order_value
        FROM orders
        WHERE status NOT IN ('cancelled')
      `,
      /* 2 — Orders by status */
      sql`
        SELECT status, COUNT(*) AS count
        FROM orders
        GROUP BY status
        ORDER BY count DESC
      `,
      /* 3 — Top 8 products by units sold (last 90 days) */
      sql`
        SELECT
          p.name, p.slug, p.image_url, p.category,
          SUM(oi.quantity)               AS units_sold,
          SUM(oi.quantity * oi.unit_kes) AS revenue_kes,
          COUNT(DISTINCT oi.order_id)    AS order_count
        FROM order_items oi
        JOIN orders o   ON o.id  = oi.order_id
        JOIN products p ON p.id = oi.product_id
        WHERE o.created_at >= now() - interval '90 days'
          AND o.status NOT IN ('cancelled')
        GROUP BY p.id, p.name, p.slug, p.image_url, p.category
        ORDER BY units_sold DESC
        LIMIT 8
      `,
      /* 4 — Slow / dead movers: no orders in 60 days */
      sql`
        SELECT p.name, p.slug, p.category, p.image_url,
          MAX(o.created_at) AS last_ordered
        FROM products p
        LEFT JOIN order_items oi ON oi.product_id = p.id
        LEFT JOIN orders o ON o.id = oi.order_id AND o.status NOT IN ('cancelled')
        GROUP BY p.id, p.name, p.slug, p.category, p.image_url
        HAVING MAX(o.created_at) IS NULL OR MAX(o.created_at) < now() - interval '60 days'
        ORDER BY last_ordered ASC NULLS FIRST
        LIMIT 8
      `,
      /* 5 — 10 most recent orders */
      sql`
        SELECT id, name, email, phone, county, town, total_kes, status, mpesa_ref, created_at
        FROM orders
        ORDER BY created_at DESC
        LIMIT 10
      `,
      /* 6 — M-Pesa success rate (last 30 days) */
      sql`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN result_code = '0'    THEN 1 ELSE 0 END) AS success,
          SUM(CASE WHEN result_code = '1032' THEN 1 ELSE 0 END) AS cancelled,
          SUM(CASE WHEN result_code NOT IN ('0','1032') AND result_code IS NOT NULL THEN 1 ELSE 0 END) AS failed
        FROM mpesa_callbacks
        WHERE created_at >= now() - interval '30 days'
      `.catch(() => [{ total: 0, success: 0, cancelled: 0, failed: 0 }]),
      /* 7 — Revenue by county (top 8) */
      sql`
        SELECT county, COUNT(*) AS orders, SUM(total_kes) AS revenue_kes
        FROM orders
        WHERE status NOT IN ('cancelled') AND county IS NOT NULL
        GROUP BY county
        ORDER BY revenue_kes DESC
        LIMIT 8
      `,
    ]);
    return res.status(200).json({
      revenue:      revRows[0]  ?? {},
      byStatus:     statusRows,
      topProducts:  topProductRows,
      slowMovers:   slowRows,
      recentOrders: recentRows,
      mpesa:        mpesaRows[0] ?? { total: 0, success: 0, cancelled: 0, failed: 0 },
      byCounty:     countyRows,
    });
  }

  /* ── CUSTOMERS ──────────────────────────────────────────────────────────
     Merged from api/admin/customers.ts
     Keyed by phone — Kenyan buyers often reorder with different name
     spellings but the same number.
  ───────────────────────────────────────────────────────────────────────── */
  if (resource === "customers") {
    if (req.method !== "GET") return res.status(405).end();
    const rows = await sql`
      SELECT
        MIN(id)::text                          AS id,
        MAX(name)                              AS name,
        MAX(email)                             AS email,
        phone,
        MAX(county)                            AS county,
        MAX(town)                              AS town,
        COUNT(*)::int                          AS order_count,
        COALESCE(SUM(
          CASE WHEN status NOT IN ('cancelled') THEN total_kes ELSE 0 END
        ), 0)::int                             AS total_spent_kes,
        MAX(created_at)                        AS last_order_at
      FROM orders
      WHERE phone IS NOT NULL
      GROUP BY phone
      ORDER BY total_spent_kes DESC
      LIMIT 500
    `;
    return res.status(200).json(rows);
  }

  /* ── STOCK ──────────────────────────────────────────────────────────────
     Merged from api/admin/stock.ts
     GET  ?_r=stock          — list all stock rows
     PUT  ?_r=stock&id=<id>  — update stock / threshold for one variant
  ───────────────────────────────────────────────────────────────────────── */
  if (resource === "stock") {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT
          ps.id, ps.product_id,
          p.name  AS product_name,
          p.slug  AS product_slug,
          ps.size, ps.colour_id,
          c.name  AS colour_name,
          ps.stock, ps.low_stock_threshold
        FROM product_stock ps
        JOIN products p ON p.id = ps.product_id
        LEFT JOIN colours c ON c.id = ps.colour_id
        ORDER BY p.name, ps.size, c.name NULLS LAST
      `;
      return res.status(200).json(rows);
    }
    if (req.method === "PUT") {
      const id = (req.query.id ?? req.body?.id) as string | undefined;
      if (!id) return res.status(400).json({ error: "Missing id" });
      const { stock, low_stock_threshold } = req.body as {
        stock?: number;
        low_stock_threshold?: number;
      };
      if (stock === undefined && low_stock_threshold === undefined)
        return res.status(400).json({ error: "Provide stock and/or low_stock_threshold" });
      if (stock !== undefined && low_stock_threshold !== undefined) {
        await sql`UPDATE product_stock SET stock=${stock}, low_stock_threshold=${low_stock_threshold}, updated_at=now() WHERE id=${id}`;
      } else if (stock !== undefined) {
        await sql`UPDATE product_stock SET stock=${stock}, updated_at=now() WHERE id=${id}`;
      } else {
        await sql`UPDATE product_stock SET low_stock_threshold=${low_stock_threshold!}, updated_at=now() WHERE id=${id}`;
      }
      const [updated] = await sql`
        SELECT
          ps.id, ps.product_id, p.name AS product_name, p.slug AS product_slug,
          ps.size, ps.colour_id, c.name AS colour_name,
          ps.stock, ps.low_stock_threshold
        FROM product_stock ps
        JOIN products p ON p.id = ps.product_id
        LEFT JOIN colours c ON c.id = ps.colour_id
        WHERE ps.id = ${id}
      `;
      return res.status(200).json(updated);
    }
    return res.status(405).end();
  }

  /* ── DELIVERY RATES ─────────────────────────────────────────────────────
     Merged from api/admin/delivery-rates.ts
     GET    ?_r=delivery-rates          — list all rates
     POST   ?_r=delivery-rates          — upsert by county + town
     PUT    ?_r=delivery-rates          — update by id
     DELETE ?_r=delivery-rates          — delete by id
  ───────────────────────────────────────────────────────────────────────── */
  if (resource === "delivery-rates") {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT id, county, town, rate_kes, updated_at
        FROM delivery_rates
        ORDER BY county ASC, town ASC NULLS LAST
      `;
      return res.status(200).json(rows);
    }
    if (req.method === "POST") {
      const { county, town, rate_kes } = req.body as {
        county: string;
        town?: string | null;
        rate_kes: number;
      };
      if (!county || rate_kes === undefined)
        return res.status(400).json({ error: "county and rate_kes required" });
      const [row] = await sql`
        INSERT INTO delivery_rates (county, town, rate_kes)
        VALUES (${county.trim()}, ${town?.trim() || null}, ${Number(rate_kes)})
        ON CONFLICT (county, town)
        DO UPDATE SET rate_kes = EXCLUDED.rate_kes, updated_at = now()
        RETURNING id, county, town, rate_kes, updated_at
      `;
      return res.status(200).json(row);
    }
    if (req.method === "PUT") {
      const { id, county, town, rate_kes } = req.body as {
        id: string;
        county: string;
        town?: string | null;
        rate_kes: number;
      };
      if (!id || !county || rate_kes === undefined)
        return res.status(400).json({ error: "id, county and rate_kes required" });
      const [row] = await sql`
        UPDATE delivery_rates
        SET county = ${county.trim()}, town = ${town?.trim() || null},
            rate_kes = ${Number(rate_kes)}, updated_at = now()
        WHERE id = ${id}
        RETURNING id, county, town, rate_kes, updated_at
      `;
      if (!row) return res.status(404).json({ error: "Rate not found" });
      return res.status(200).json(row);
    }
    if (req.method === "DELETE") {
      const { id } = req.body as { id: string };
      if (!id) return res.status(400).json({ error: "id required" });
      await sql`DELETE FROM delivery_rates WHERE id = ${id}`;
      return res.status(204).end();
    }
    return res.status(405).end();
  }

  /* ── COLOURS ────────────────────────────────────────────────────────── */
  if (resource === "colours") {
    if (req.method === "GET") {
      const rows = await sql`SELECT id, code, name, hex, family FROM colours ORDER BY family, name`;
      return res.json(rows);
    }
    if (req.method === "POST") {
      const { code, name, hex, family } = req.body;
      const [row] = await sql`
        INSERT INTO colours (id, code, name, hex, family)
        VALUES (gen_random_uuid(), ${code}, ${name}, ${hex}, ${family})
        RETURNING id, code, name, hex, family
      `;
      return res.status(201).json(row);
    }
    if (req.method === "PUT") {
      const { id, code, name, hex, family } = req.body;
      const [row] = await sql`
        UPDATE colours SET code=${code}, name=${name}, hex=${hex}, family=${family}
        WHERE id=${id} RETURNING id, code, name, hex, family
      `;
      return res.json(row);
    }
    if (req.method === "DELETE") {
      const { id } = req.body;
      await sql`DELETE FROM colours WHERE id=${id}`;
      return res.json({ ok: true });
    }
    return res.status(405).end();
  }

  /* ── PRODUCTS ───────────────────────────────────────────────────────── */
  if (resource === "products") {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT p.id, p.slug, p.name, p.blurb, p.category, p.image_url,
          json_agg(json_build_object('id', v.id, 'size', v.size, 'price_kes', v.price_kes) ORDER BY v.size) AS variants
        FROM products p LEFT JOIN variants v ON v.product_id = p.id
        GROUP BY p.id ORDER BY p.category, p.name
      `;
      return res.json(rows);
    }
    if (req.method === "POST") {
      const { slug, name, blurb, category, image_url } = req.body;
      const [prod] = await sql`
        INSERT INTO products (id, slug, name, blurb, category, image_url)
        VALUES (gen_random_uuid(), ${slug}, ${name}, ${blurb}, ${category}, ${image_url})
        RETURNING id, slug, name, blurb, category, image_url
      `;
      await sql`
        INSERT INTO variants (id, product_id, size, price_kes) VALUES
          (gen_random_uuid(), ${prod.id}, '1L',  0),
          (gen_random_uuid(), ${prod.id}, '4L',  0),
          (gen_random_uuid(), ${prod.id}, '20L', 0)
      `;
      return res.status(201).json(prod);
    }
    if (req.method === "PUT") {
      const { id, slug, name, blurb, category, image_url } = req.body;
      const [row] = await sql`
        UPDATE products SET slug=${slug}, name=${name}, blurb=${blurb}, category=${category}, image_url=${image_url}
        WHERE id=${id} RETURNING id, slug, name, blurb, category, image_url
      `;
      return res.json(row);
    }
    if (req.method === "DELETE") {
      const { id } = req.body;
      await sql`DELETE FROM variants WHERE product_id=${id}`;
      await sql`DELETE FROM products WHERE id=${id}`;
      return res.json({ ok: true });
    }
    return res.status(405).end();
  }

  /* ── VARIANTS ───────────────────────────────────────────────────────── */
  if (resource === "variants") {
    if (req.method !== "PUT") return res.status(405).end();
    const { id, price_kes } = req.body;
    const [row] = await sql`
      UPDATE variants SET price_kes=${price_kes}
      WHERE id=${id} RETURNING id, product_id, size, price_kes
    `;
    return res.json(row);
  }

  /* ── ROOMS ──────────────────────────────────────────────────────────── */
  if (resource === "rooms") {
    if (req.method === "GET") {
      const rows = await sql`SELECT id, name, photo_url, wall_mask, sort_order FROM rooms ORDER BY sort_order`;
      return res.json(rows);
    }
    if (req.method === "POST") {
      const { name, photo_url, wall_mask, sort_order } = req.body;
      const [row] = await sql`
        INSERT INTO rooms (id, name, photo_url, wall_mask, sort_order)
        VALUES (gen_random_uuid(), ${name}, ${photo_url}, ${wall_mask ?? null}, ${sort_order ?? 99})
        RETURNING id, name, photo_url, wall_mask, sort_order
      `;
      return res.status(201).json(row);
    }
    if (req.method === "PUT") {
      const { id, name, photo_url, wall_mask, sort_order } = req.body;
      const [row] = await sql`
        UPDATE rooms SET name=${name}, photo_url=${photo_url}, wall_mask=${wall_mask ?? null}, sort_order=${sort_order ?? 99}
        WHERE id=${id} RETURNING id, name, photo_url, wall_mask, sort_order
      `;
      return res.json(row);
    }
    if (req.method === "DELETE") {
      const { id } = req.body;
      await sql`DELETE FROM rooms WHERE id=${id}`;
      return res.json({ ok: true });
    }
    return res.status(405).end();
  }

  /* ── ORDERS ─────────────────────────────────────────────────────────── */
  if (resource === "orders") {
    if (req.method === "GET") {
      type Row = Record<string, unknown>;
      const orders = (await sql`
        SELECT id, name, email, phone, county, town, address,
          subtotal_kes, delivery_kes, total_kes, status, mpesa_ref, created_at
        FROM orders ORDER BY created_at DESC LIMIT 200
      `) as Row[];
      const orderIds = orders.map(o => String(o.id));
      const items: Row[] = orders.length
        ? ((await sql`
            SELECT
              oi.order_id,
              p.slug  AS product_slug,
              p.name  AS product_name,
              oi.size,
              oi.finish,
              oi.quantity,
              oi.unit_kes,
              c.name  AS colour_name,
              c.hex   AS colour_hex
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            LEFT JOIN colours c ON c.id = oi.colour_id
            WHERE oi.order_id = ANY(${orderIds})
          `) as Row[])
        : [];
      const itemsByOrder = items.reduce<Record<string, Row[]>>((acc, item) => {
        const oid = String(item.order_id);
        (acc[oid] ??= []).push(item);
        return acc;
      }, {});
      return res.json(orders.map(o => ({ ...o, items: itemsByOrder[String(o.id)] ?? [] })));
    }
    if (req.method === "PUT") {
      const { id, status } = req.body;
      const allowed = ["pending", "paid", "processing", "shipped", "delivered", "cancelled"];
      if (!allowed.includes(status))
        return res.status(400).json({ error: "Invalid status" });
      const [row] = await sql`
        UPDATE orders SET status=${status}, updated_at=now()
        WHERE id=${id} RETURNING id, status
      `;
      return res.json(row);
    }
    return res.status(405).end();
  }

  return res.status(404).json({ error: "Unknown resource" });
}
