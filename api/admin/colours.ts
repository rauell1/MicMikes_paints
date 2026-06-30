import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import { verifyAdminToken } from "../_lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!verifyAdminToken(req.headers.authorization))
    return res.status(401).json({ error: "Unauthorized" });

  const sql = neon(process.env.DATABASE_URL!);

  if (req.method === "GET") {
    const rows = await sql`SELECT id, code, name, hex, family FROM colours ORDER BY family, name`;
    return res.json(rows);
  }

  if (req.method === "POST") {
    const { code, name, hex, family } = req.body;
    const [row] = await sql`
      INSERT INTO colours (id, code, name, hex, family)
      VALUES (gen_random_uuid(), ${code}, ${name}, ${hex}, ${family})
      RETURNING id, code, name, hex, family`;
    return res.status(201).json(row);
  }

  if (req.method === "PUT") {
    const { id, code, name, hex, family } = req.body;
    const [row] = await sql`
      UPDATE colours SET code=${code}, name=${name}, hex=${hex}, family=${family}
      WHERE id=${id} RETURNING id, code, name, hex, family`;
    return res.json(row);
  }

  if (req.method === "DELETE") {
    const { id } = req.body;
    await sql`DELETE FROM colours WHERE id=${id}`;
    return res.json({ ok: true });
  }

  res.status(405).end();
}
