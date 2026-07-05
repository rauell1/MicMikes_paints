import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";

const ALLOWED_ORIGINS = [
  "https://mic-mikes-paints.vercel.app",
  "https://www.micmikespaints.co.ke",
  "https://micmikespaints.co.ke",
  "http://localhost:5173",
  "http://localhost:3000",
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const sql = neon(process.env.DATABASE_URL!);

  // ?county=Kiambu&town=Ruiru  → single rate lookup
  if (req.query.county) {
    const county = String(req.query.county).trim();
    const town   = req.query.town ? String(req.query.town).trim() : null;

    // Try exact county+town match first, then county-only fallback
    const rows = await sql`
      SELECT rate_kes FROM delivery_rates
      WHERE LOWER(county) = LOWER(${county})
        AND (LOWER(town) = LOWER(${town ?? ""}) OR town IS NULL)
      ORDER BY
        CASE WHEN town IS NOT NULL AND LOWER(town) = LOWER(${town ?? ""}) THEN 0 ELSE 1 END
      LIMIT 1`;

    if (rows.length) return res.json({ rate_kes: rows[0].rate_kes });
    return res.json({ rate_kes: null }); // no rate set → will fall back to default
  }

  // No params → return all rates (used by checkout county dropdown)
  const rows = await sql`SELECT county, town, rate_kes FROM delivery_rates ORDER BY county, town`;
  return res.json(rows);
}
