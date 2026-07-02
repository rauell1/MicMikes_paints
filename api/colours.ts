import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const sql = neon(process.env.DATABASE_URL!);

  // GET /api/colours?popular=1 — top colour ids from the last 30 days of
  // cart_events (an add-to-cart counts 3x a swatch click). Folded in here
  // rather than a separate function: Hobby plan caps deployments at 12 fns.
  if (req.query.popular) {
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
    return res.json(rows.map(r => r.colour_id));
  }

  const rows = await sql`
    SELECT id, code, name, hex, family
    FROM colours
    ORDER BY family, name
  `;
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
  res.json(rows);
}
