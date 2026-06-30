import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import { verifyAdminToken } from "../_lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!verifyAdminToken(req.headers.authorization))
    return res.status(401).json({ error: "Unauthorized" });

  if (req.method !== "PUT") return res.status(405).end();

  const sql = neon(process.env.DATABASE_URL!);
  const { id, price_kes } = req.body;
  const [row] = await sql`
    UPDATE variants SET price_kes=${price_kes} WHERE id=${id}
    RETURNING id, product_id, size, price_kes`;
  return res.json(row);
}
