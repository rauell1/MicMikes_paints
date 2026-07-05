import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";

/* ─────────────────────────────────────────────────────────────────────────────
   /api/me — the logged-in staff/customer's own orders (session-scoped).

   Routes (via ?_r=): orders | order (query id)

   order_items has NO product_slug/colour_name columns in this schema, so we
   join products (slug/name) and colours (name/hex) — matching api/orders.ts.
   Driver: @neondatabase/serverless — sql`...` returns rows array directly.
───────────────────────────────────────────────────────────────────────────── */

type SessionUser = { id: string; name: string; phone: string; role: string };

async function getSessionUser(
  req: VercelRequest,
  sql: ReturnType<typeof neon>
): Promise<SessionUser | null> {
  const token = req.cookies?.session_token;
  if (!token) return null;
  const rows = await sql`
    SELECT u.id, u.name, u.phone, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ${token} AND s.expires_at > NOW() AND u.deleted_at IS NULL
    LIMIT 1`;
  return (rows[0] as SessionUser) ?? null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const sql = neon(process.env.DATABASE_URL!);
  const resource = req.query._r as string | undefined;

  try {
    const user = await getSessionUser(req, sql);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    /* ── ORDERS (list for this user) ──────────────────────────────────── */
    if (resource === "orders") {
      const orders = await sql`
        SELECT o.id, o.total_kes, o.status, o.created_at, o.mpesa_ref,
               (
                 SELECT json_agg(json_build_object(
                   'productSlug', p.slug,
                   'colourName',  COALESCE(c.name, 'No colour'),
                   'colourHex',   COALESCE(c.hex,  '#cccccc'),
                   'size',        oi.size,
                   'finish',      oi.finish,
                   'quantity',    oi.quantity,
                   'unitKes',     oi.unit_kes
                 ))
                 FROM order_items oi
                 JOIN products p ON p.id = oi.product_id
                 LEFT JOIN colours c ON c.id = oi.colour_id
                 WHERE oi.order_id = o.id
               ) AS items
        FROM orders o
        WHERE o.phone = ${user.phone}
        ORDER BY o.created_at DESC`;
      return res.json({ orders: orders.map(o => ({ ...o, items: o.items ?? [] })) });
    }

    /* ── ORDER (single, ownership-checked) ────────────────────────────── */
    if (resource === "order") {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: "id is required" });
      const rows = await sql`
        SELECT o.*,
               (
                 SELECT json_agg(json_build_object(
                   'productSlug', p.slug,
                   'colourName',  COALESCE(c.name, 'No colour'),
                   'colourHex',   COALESCE(c.hex,  '#cccccc'),
                   'size',        oi.size,
                   'finish',      oi.finish,
                   'quantity',    oi.quantity,
                   'unitKes',     oi.unit_kes
                 ))
                 FROM order_items oi
                 JOIN products p ON p.id = oi.product_id
                 LEFT JOIN colours c ON c.id = oi.colour_id
                 WHERE oi.order_id = o.id
               ) AS items
        FROM orders o
        WHERE o.id = ${id as string}
        LIMIT 1`;
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      if (rows[0].phone !== user.phone) return res.status(403).json({ error: "Forbidden" });
      return res.json({ order: { ...rows[0], items: rows[0].items ?? [] } });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    console.error("[api/me]", err);
    return res.status(500).json({ error: "Server error" });
  }
}
