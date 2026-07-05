import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

/* ── auth ── */
function signToken(): string {
  const payload = String(Date.now());
  const sig = crypto.createHmac("sha256", process.env.ADMIN_JWT_SECRET!).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const lastDot = decoded.lastIndexOf(".");
    const payload = decoded.slice(0, lastDot);
    const sig = decoded.slice(lastDot + 1);
    const expected = crypto.createHmac("sha256", process.env.ADMIN_JWT_SECRET!).update(payload).digest("hex");
    const sigBuf = Buffer.from(sig, "hex");
    const expBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expBuf.length || sigBuf.length === 0) return false;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;
    const ts = parseInt(payload, 10);
    return !isNaN(ts) && Date.now() - ts < 24 * 60 * 60 * 1000;
  } catch { return false; }
}

const COOKIE = "mm-admin-token";
const cookieOpts = "HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400";

/* ── main handler ── */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const resource = req.query._r as string | undefined;

  /* ── LOGIN (no auth required) ── */
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
      res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
      return res.json({ ok: true });
    }
    return res.status(405).end();
  }

  /* ── All other resources require auth ── */
  if (!verifyToken(req.cookies?.[COOKIE] as string | undefined))
    return res.status(401).json({ error: "Unauthorized" });

  const sql = neon(process.env.DATABASE_URL!);

  /* ── COLOURS ── */
  if (resource === "colours") {
    if (req.method === "GET") {
      const rows = await sql`SELECT id, code, name, hex, family FROM colours ORDER BY family, name`;
      return res.json(rows);
    }
    if (req.method === "POST") {
      const { code, name, hex, family } = req.body;
      const [row] = await sql`INSERT INTO colours (id, code, name, hex, family) VALUES (gen_random_uuid(), ${code}, ${name}, ${hex}, ${family}) RETURNING id, code, name, hex, family`;
      return res.status(201).json(row);
    }
    if (req.method === "PUT") {
      const { id, code, name, hex, family } = req.body;
      const [row] = await sql`UPDATE colours SET code=${code}, name=${name}, hex=${hex}, family=${family} WHERE id=${id} RETURNING id, code, name, hex, family`;
      return res.json(row);
    }
    if (req.method === "DELETE") {
      const { id } = req.body;
      await sql`DELETE FROM colours WHERE id=${id}`;
      return res.json({ ok: true });
    }
    return res.status(405).end();
  }

  /* ── PRODUCTS ── */
  if (resource === "products") {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT p.id, p.slug, p.name, p.blurb, p.category, p.image_url,
          json_agg(json_build_object('id', v.id, 'size', v.size, 'price_kes', v.price_kes) ORDER BY v.size) AS variants
        FROM products p LEFT JOIN variants v ON v.product_id = p.id
        GROUP BY p.id ORDER BY p.category, p.name`;
      return res.json(rows);
    }
    if (req.method === "POST") {
      const { slug, name, blurb, category, image_url } = req.body;
      const [prod] = await sql`INSERT INTO products (id, slug, name, blurb, category, image_url) VALUES (gen_random_uuid(), ${slug}, ${name}, ${blurb}, ${category}, ${image_url}) RETURNING id, slug, name, blurb, category, image_url`;
      await sql`INSERT INTO variants (id, product_id, size, price_kes) VALUES (gen_random_uuid(), ${prod.id}, '1L', 0),(gen_random_uuid(), ${prod.id}, '4L', 0),(gen_random_uuid(), ${prod.id}, '20L', 0)`;
      return res.status(201).json(prod);
    }
    if (req.method === "PUT") {
      const { id, slug, name, blurb, category, image_url } = req.body;
      const [row] = await sql`UPDATE products SET slug=${slug}, name=${name}, blurb=${blurb}, category=${category}, image_url=${image_url} WHERE id=${id} RETURNING id, slug, name, blurb, category, image_url`;
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

  /* ── VARIANTS ── */
  if (resource === "variants") {
    if (req.method !== "PUT") return res.status(405).end();
    const { id, price_kes } = req.body;
    const [row] = await sql`UPDATE variants SET price_kes=${price_kes} WHERE id=${id} RETURNING id, product_id, size, price_kes`;
    return res.json(row);
  }

  /* ── ROOMS ── */
  if (resource === "rooms") {
    if (req.method === "GET") {
      const rows = await sql`SELECT id, name, photo_url, wall_mask, sort_order FROM rooms ORDER BY sort_order`;
      return res.json(rows);
    }
    if (req.method === "POST") {
      const { name, photo_url, wall_mask, sort_order } = req.body;
      const [row] = await sql`INSERT INTO rooms (id, name, photo_url, wall_mask, sort_order) VALUES (gen_random_uuid(), ${name}, ${photo_url}, ${wall_mask ?? null}, ${sort_order ?? 99}) RETURNING id, name, photo_url, wall_mask, sort_order`;
      return res.status(201).json(row);
    }
    if (req.method === "PUT") {
      const { id, name, photo_url, wall_mask, sort_order } = req.body;
      const [row] = await sql`UPDATE rooms SET name=${name}, photo_url=${photo_url}, wall_mask=${wall_mask ?? null}, sort_order=${sort_order ?? 99} WHERE id=${id} RETURNING id, name, photo_url, wall_mask, sort_order`;
      return res.json(row);
    }
    if (req.method === "DELETE") {
      const { id } = req.body;
      await sql`DELETE FROM rooms WHERE id=${id}`;
      return res.json({ ok: true });
    }
    return res.status(405).end();
  }

  /* ── ORDERS ── */
  if (resource === "orders") {
    if (req.method === "GET") {
      type Row = Record<string, unknown>;
      const orders = (await sql`
        SELECT id, name, email, phone, county, town, address,
          subtotal_kes, delivery_kes, total_kes, status, mpesa_ref, created_at
        FROM orders ORDER BY created_at DESC LIMIT 200`) as Row[];
      const orderIds = orders.map(o => String(o.id));
      const items: Row[] = orders.length
        ? (await sql`
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
            WHERE oi.order_id = ANY(${orderIds})`) as Row[]
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
      const allowed = ["pending","paid","processing","shipped","delivered","cancelled"];
      if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status" });
      const [row] = await sql`UPDATE orders SET status=${status}, updated_at=now() WHERE id=${id} RETURNING id, status`;
      return res.json(row);
    }
    return res.status(405).end();
  }

  /* ── DELIVERY RATES ── */
  if (resource === "delivery-rates") {
    if (req.method === "GET") {
      const rows = await sql`SELECT id, county, town, rate_kes, notes FROM delivery_rates ORDER BY county, town`;
      return res.json(rows);
    }
    if (req.method === "POST") {
      const { county, town, rate_kes, notes } = req.body;
      if (!county || rate_kes === undefined) return res.status(400).json({ error: "county and rate_kes required" });
      const [row] = await sql`
        INSERT INTO delivery_rates (id, county, town, rate_kes, notes)
        VALUES (gen_random_uuid(), ${String(county).trim()}, ${town ? String(town).trim() : null}, ${Number(rate_kes)}, ${notes ?? null})
        RETURNING id, county, town, rate_kes, notes`;
      return res.status(201).json(row);
    }
    if (req.method === "PUT") {
      const { id, county, town, rate_kes, notes } = req.body;
      const [row] = await sql`
        UPDATE delivery_rates SET county=${String(county).trim()}, town=${town ? String(town).trim() : null}, rate_kes=${Number(rate_kes)}, notes=${notes ?? null}
        WHERE id=${id}
        RETURNING id, county, town, rate_kes, notes`;
      return res.json(row);
    }
    if (req.method === "DELETE") {
      const { id } = req.body;
      await sql`DELETE FROM delivery_rates WHERE id=${id}`;
      return res.json({ ok: true });
    }
    return res.status(405).end();
  }

  return res.status(404).json({ error: "Unknown resource" });
}
