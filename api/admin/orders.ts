import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import { verifyAdminToken } from "../_lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!verifyAdminToken(req.headers.authorization))
    return res.status(401).json({ error: "Unauthorized" });

  const sql = neon(process.env.DATABASE_URL!);

  if (req.method === "GET") {
    const orders = await sql`
      SELECT id, name, email, phone, county, town, address,
        subtotal_kes, delivery_kes, total_kes, status, mpesa_ref, created_at
      FROM orders ORDER BY created_at DESC LIMIT 200`;

    const items = orders.length
      ? await sql`
          SELECT oi.order_id, oi.product_slug, oi.colour_id, oi.size,
            oi.finish, oi.quantity, oi.unit_kes,
            c.name AS colour_name, c.hex AS colour_hex
          FROM order_items oi
          LEFT JOIN colours c ON c.id = oi.colour_id
          WHERE oi.order_id = ANY(${orders.map((o: { id: string }) => o.id)})`
      : [];

    const itemsByOrder = (items as Array<{ order_id: string } & Record<string, unknown>>)
      .reduce<Record<string, unknown[]>>((acc, item) => {
        (acc[item.order_id] ??= []).push(item);
        return acc;
      }, {});

    return res.json(orders.map((o: { id: string } & Record<string, unknown>) => ({
      ...o,
      items: itemsByOrder[o.id] ?? [],
    })));
  }

  if (req.method === "PUT") {
    const { id, status } = req.body;
    const allowed = ["pending", "paid", "processing", "shipped", "delivered", "cancelled"];
    if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status" });
    const [row] = await sql`
      UPDATE orders SET status=${status}, updated_at=now() WHERE id=${id}
      RETURNING id, status`;
    return res.json(row);
  }

  res.status(405).end();
}
