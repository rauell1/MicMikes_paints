import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    SELECT id, code, name, hex, family
    FROM colours
    ORDER BY family, name
  `;
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
  res.json(rows);
}
