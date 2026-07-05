import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import { verifyAdminSession } from "../../src/lib/adminAuth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await verifyAdminSession(req))) return res.status(401).json({ error: "Unauthorised" });

  const sql = neon(process.env.DATABASE_URL!);

  /* GET — list all rates */
  if (req.method === "GET") {
    const rows = await sql`
      SELECT id, county, town, rate_kes, updated_at
      FROM delivery_rates
      ORDER BY county, NULLS LAST, town
    `;
    return res.status(200).json(rows);
  }

  /* POST — upsert a rate (county + town) */
  if (req.method === "POST") {
    const { county, town, rate_kes } = req.body as { county: string; town?: string | null; rate_kes: number };
    if (!county || rate_kes === undefined) return res.status(400).json({ error: "county and rate_kes required" });
    const [row] = await sql`
      INSERT INTO delivery_rates (county, town, rate_kes)
      VALUES (${county.trim()}, ${town?.trim() || null}, ${Number(rate_kes)})
      ON CONFLICT (county, town)
      DO UPDATE SET rate_kes = EXCLUDED.rate_kes, updated_at = now()
      RETURNING id, county, town, rate_kes, updated_at
    `;
    return res.status(200).json(row);
  }

  /* PUT — update rate by id */
  if (req.method === "PUT") {
    const { id, county, town, rate_kes } = req.body as { id: string; county: string; town?: string | null; rate_kes: number };
    if (!id || !county || rate_kes === undefined) return res.status(400).json({ error: "id, county and rate_kes required" });
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

  /* DELETE — remove a rate by id */
  if (req.method === "DELETE") {
    const { id } = req.body as { id: string };
    if (!id) return res.status(400).json({ error: "id required" });
    await sql`DELETE FROM delivery_rates WHERE id = ${id}`;
    return res.status(204).end();
  }

  return res.status(405).json({ error: "Method not allowed" });
}
