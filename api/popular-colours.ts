import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";

// Top colours over the last 30 days: an add-to-cart counts 3x a swatch click.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const sql = neon(process.env.DATABASE_URL!);
  try {
    const rows = await sql`
      SELECT colour_id,
             SUM(CASE WHEN event_type = 'add' THEN 3 ELSE 1 END) AS score
      FROM cart_events
      WHERE colour_id IS NOT NULL
        AND event_type IN ('add', 'swatch_click')
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY colour_id
      ORDER BY score DESC
      LIMIT 5
    `;
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    res.json(rows.map(r => r.colour_id));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
