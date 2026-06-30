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
  if (req.method !== "PUT") return res.status(405).end();
  const sql = neon(process.env.DATABASE_URL!);
  const { id, price_kes } = req.body;
  const [row] = await sql`UPDATE variants SET price_kes=${price_kes} WHERE id=${id} RETURNING id, product_id, size, price_kes`;
  return res.json(row);
}
