import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";

// Hobby plan caps deployments at 12 serverless functions.
// This file handles all visualizer-related read-only catalogue endpoints:
//   GET /api/colours              — full colour list
//   GET /api/colours?popular=1    — top 5 colours (last 30 days)
//   GET /api/colours?type=rooms   — rooms for the visualizer

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const sql = neon(process.env.DATABASE_URL!);

  // --- Rooms (visualizer backgrounds) ---
  if (req.query.type === "rooms") {
    const rows = await sql`
      SELECT id, name, photo_url AS "photo", wall_mask AS "wallMask"
      FROM rooms
      ORDER BY sort_order
    `;
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    return res.json(rows);
  }

  // --- Popular colour IDs (last 30 days) ---
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
    return res.json(rows.map((r) => r.colour_id));
  }

  // --- Full colour list ---
  const rows = await sql`
    SELECT id, code, name, hex, family
    FROM colours
    ORDER BY family, name
  `;
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
  return res.json(rows);
}
