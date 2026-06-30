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
    type Row = Record<string, unknown>;
    const orders = (await sql`
      SELECT id, name, email, phone, county, town, address,
        subtotal_kes, delivery_kes, total_kes, status, mpesa_ref, created_at
      FROM orders ORDER BY created_at DESC LIMIT 200`) as Row[];

    const orderIds = orders.map(o => String(o.id));
    const items: Row[] = orders.length
      ? (await sql`
          SELECT oi.order_id, oi.product_slug, oi.colour_id, oi.size,
            oi.finish, oi.quantity, oi.unit_kes,
            c.name AS colour_name, c.hex AS colour_hex
          FROM order_items oi
          LEFT JOIN colours c ON c.id = oi.colour_id
          WHERE oi.order_id = ANY(${orderIds})`) as Row[]
      : [];

    const itemsByOrder = items.reduce<Record<string, Row[]>>((acc, item) => {
      const oid = String(item.order_id);
      (acc[oid] ??= []).push(item);
      return acc;
    }, {});

    return res.json(orders.map(o => ({ ...o, items: itemsByOrder[String(o.id)] ?? [] })));
  }

  if (req.method === "PUT") {
    const { id, status } = req.body;
    const allowed = ["pending","paid","processing","shipped","delivered","cancelled"];
    if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status" });
    const [row] = await sql`UPDATE orders SET status=${status}, updated_at=now() WHERE id=${id} RETURNING id, status`;
    return res.json(row);
  }

  res.status(405).end();
}
