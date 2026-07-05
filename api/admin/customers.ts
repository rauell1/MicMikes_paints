import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import { verifyAdminSession } from "../../src/lib/adminAuth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!(await verifyAdminSession(req))) return res.status(401).json({ error: "Unauthorised" });

  const sql = neon(process.env.DATABASE_URL!);

  // Aggregate one row per unique phone number.
  // Uses phone as the canonical customer key because Kenyan buyers
  // often reorder with slightly different name spellings but the same number.
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
