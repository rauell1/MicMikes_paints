import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import { verifyAdminSession } from "../../src/lib/adminAuth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await verifyAdminSession(req))) return res.status(401).json({ error: "Unauthorised" });

  const sql = neon(process.env.DATABASE_URL!);

  /* ── GET  /api/admin/stock ─────────────────────────────────────── */
  if (req.method === "GET") {
    const rows = await sql`
      SELECT
        ps.id,
        ps.product_id,
        p.name  AS product_name,
        p.slug  AS product_slug,
        ps.size,
        ps.colour_id,
        c.name  AS colour_name,
        ps.stock,
        ps.low_stock_threshold
      FROM product_stock ps
      JOIN products p ON p.id = ps.product_id
      LEFT JOIN colours c ON c.id = ps.colour_id
      ORDER BY p.name, ps.size, c.name NULLS LAST
    `;
    return res.status(200).json(rows);
  }

  /* ── PUT  /api/admin/stock/:id ─────────────────────────────────── */
  if (req.method === "PUT") {
    // Vercel file-based routing passes the dynamic segment via req.query
    const id = req.query.id as string | undefined;
    if (!id) return res.status(400).json({ error: "Missing id" });

    const { stock, low_stock_threshold } = req.body as {
      stock?: number;
      low_stock_threshold?: number;
    };

    if (stock === undefined && low_stock_threshold === undefined)
      return res.status(400).json({ error: "Provide stock and/or low_stock_threshold" });

    // Build a safe partial update — only update the fields that were sent
    if (stock !== undefined && low_stock_threshold !== undefined) {
      await sql`
        UPDATE product_stock
        SET stock = ${stock}, low_stock_threshold = ${low_stock_threshold}, updated_at = now()
        WHERE id = ${id}
      `;
    } else if (stock !== undefined) {
      await sql`
        UPDATE product_stock
        SET stock = ${stock}, updated_at = now()
        WHERE id = ${id}
      `;
    } else {
      await sql`
        UPDATE product_stock
        SET low_stock_threshold = ${low_stock_threshold!}, updated_at = now()
        WHERE id = ${id}
      `;
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

  return res.status(405).json({ error: "Method not allowed" });
}
