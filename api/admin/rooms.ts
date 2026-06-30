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
    const rows = await sql`SELECT id, name, photo_url, wall_mask, sort_order FROM rooms ORDER BY sort_order`;
    return res.json(rows);
  }
  if (req.method === "POST") {
    const { name, photo_url, wall_mask, sort_order } = req.body;
    const [row] = await sql`INSERT INTO rooms (id, name, photo_url, wall_mask, sort_order) VALUES (gen_random_uuid(), ${name}, ${photo_url}, ${wall_mask ?? null}, ${sort_order ?? 99}) RETURNING id, name, photo_url, wall_mask, sort_order`;
    return res.status(201).json(row);
  }
  if (req.method === "PUT") {
    const { id, name, photo_url, wall_mask, sort_order } = req.body;
    const [row] = await sql`UPDATE rooms SET name=${name}, photo_url=${photo_url}, wall_mask=${wall_mask ?? null}, sort_order=${sort_order ?? 99} WHERE id=${id} RETURNING id, name, photo_url, wall_mask, sort_order`;
    return res.json(row);
  }
  if (req.method === "DELETE") {
    const { id } = req.body;
    await sql`DELETE FROM rooms WHERE id=${id}`;
    return res.json({ ok: true });
  }
  res.status(405).end();
}
