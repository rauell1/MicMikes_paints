import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { name, email, phone, county, town, address, items, subtotalKes, deliveryKes, totalKes } = req.body;

  if (!name || !email || !phone || !county || !town || !address || !items?.length) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const sql = neon(process.env.DATABASE_URL!);

  const [order] = await sql`
    INSERT INTO orders (name, email, phone, county, town, address, subtotal_kes, delivery_kes, total_kes, status)
    VALUES (${name}, ${email}, ${phone}, ${county}, ${town}, ${address},
            ${subtotalKes}, ${deliveryKes}, ${totalKes}, 'pending')
    RETURNING id
  `;

  for (const item of items) {
    const [product] = await sql`SELECT id FROM products WHERE slug = ${item.productSlug}`;
    const [colour] = item.colourId
      ? await sql`SELECT id FROM colours WHERE id = ${item.colourId}`
      : [null];

    await sql`
      INSERT INTO order_items (order_id, product_id, colour_id, size, finish, quantity, unit_kes)
      VALUES (${order.id}, ${product?.id ?? null}, ${colour?.id ?? null},
              ${item.size}, ${item.finish}, ${item.quantity}, ${item.unitKes})
    `;
  }

  await sql`
    INSERT INTO order_events (order_id, event_type, payload)
    VALUES (${order.id}, 'created', ${JSON.stringify({ source: "web" })}::jsonb)
  `;

  res.status(201).json({ orderId: order.id });
}
