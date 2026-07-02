import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";

const MAX_LEN = 200;
const MAX_ITEMS = 30;
const MAX_QTY = 50;
const FREE_DELIVERY_MIN = 15000;
const DELIVERY_FEE = 350;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { name, email, phone, county, town, address, items } = req.body;

  if (!name || !email || !phone || !county || !town || !address || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  for (const v of [name, email, phone, county, town, address]) {
    if (typeof v !== "string" || v.length > MAX_LEN) {
      return res.status(400).json({ error: "Invalid field value" });
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Invalid email" });
  }
  if (!/^2547\d{8}$/.test(phone)) {
    return res.status(400).json({ error: "Phone must be 2547XXXXXXXX" });
  }
  if (items.length > MAX_ITEMS) {
    return res.status(400).json({ error: "Too many items" });
  }

  const sql = neon(process.env.DATABASE_URL!);

  // Server-side pricing: never trust client-sent amounts. Look up each
  // item's real price from variants; reject unknown products/sizes.
  const verified: { productId: string; colourId: string | null; size: string; finish: string; quantity: number; unitKes: number }[] = [];
  for (const item of items) {
    const qty = Number(item.quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      return res.status(400).json({ error: "Invalid quantity" });
    }
    const [row] = await sql`
      SELECT p.id AS product_id, v.price_kes
      FROM products p
      JOIN variants v ON v.product_id = p.id AND v.size = ${item.size}
      WHERE p.slug = ${item.productSlug} AND p.active = true
    `;
    if (!row) return res.status(400).json({ error: `Unknown product/size: ${item.productSlug} ${item.size}` });

    const [colour] = item.colourId
      ? await sql`SELECT id FROM colours WHERE id = ${item.colourId}`
      : [null];

    verified.push({
      productId: row.product_id,
      colourId: colour?.id ?? null,
      size: item.size,
      finish: String(item.finish ?? "Matte").slice(0, 30),
      quantity: qty,
      unitKes: row.price_kes,
    });
  }

  const subtotalKes = verified.reduce((s, i) => s + i.unitKes * i.quantity, 0);
  const deliveryKes = subtotalKes >= FREE_DELIVERY_MIN ? 0 : DELIVERY_FEE;
  const totalKes = subtotalKes + deliveryKes;

  const [order] = await sql`
    INSERT INTO orders (name, email, phone, county, town, address, subtotal_kes, delivery_kes, total_kes, status)
    VALUES (${name}, ${email}, ${phone}, ${county}, ${town}, ${address},
            ${subtotalKes}, ${deliveryKes}, ${totalKes}, 'pending')
    RETURNING id, created_at
  `;

  for (const item of verified) {
    await sql`
      INSERT INTO order_items (order_id, product_id, colour_id, size, finish, quantity, unit_kes)
      VALUES (${order.id}, ${item.productId}, ${item.colourId},
              ${item.size}, ${item.finish}, ${item.quantity}, ${item.unitKes})
    `;
  }

  await sql`
    INSERT INTO order_events (order_id, event_type, payload)
    VALUES (${order.id}, 'created', ${JSON.stringify({ source: "web" })}::jsonb)
  `;

  // Human-friendly order reference: INV-YYYYMMDD-<last 4 hex of order id>
  const d = new Date(order.created_at);
  const ref = `INV-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(order.id).replace(/-/g, "").slice(-4).toUpperCase()}`;

  res.status(201).json({ orderId: order.id, reference: ref, subtotalKes, deliveryKes, totalKes });
}
