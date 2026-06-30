import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

function verifyAdminToken(authHeader: string | undefined): boolean {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const lastDot = decoded.lastIndexOf(".");
    const payload = decoded.slice(0, lastDot);
    const sig = decoded.slice(lastDot + 1);
    const expected = crypto.createHmac("sha256", process.env.ADMIN_JWT_SECRET!).update(payload).digest("hex");
    const sigBuf = Buffer.from(sig, "hex");
    const expBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expBuf.length || sigBuf.length === 0) return false;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;
    const ts = parseInt(payload, 10);
    return !isNaN(ts) && Date.now() - ts < 24 * 60 * 60 * 1000;
  } catch { return false; }
}

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
    const [row] = await sql`INSERT INTO colours (id, code, name, hex, family) VALUES (gen_random_uuid(), ${code}, ${name}, ${hex}, ${family}) RETURNING id, code, name, hex, family`;
    return res.status(201).json(row);
  }
  if (req.method === "PUT") {
    const { id, code, name, hex, family } = req.body;
    const [row] = await sql`UPDATE colours SET code=${code}, name=${name}, hex=${hex}, family=${family} WHERE id=${id} RETURNING id, code, name, hex, family`;
    return res.json(row);
  }
  if (req.method === "DELETE") {
    const { id } = req.body;
    await sql`DELETE FROM colours WHERE id=${id}`;
    return res.json({ ok: true });
  }
  res.status(405).end();
}
