import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import { orderFormSchema, getFieldErrors, normaliseKenyanPhone } from "../src/lib/validation.js";
import { sanitize, sanitizeEmail } from "../src/lib/sanitize.js";

const FREE_DELIVERY_MIN = 15000;
const DELIVERY_FEE = 350;

const ALLOWED_ORIGINS = [
  "https://mic-mikes-paints.vercel.app",
  "https://www.micmikespaints.co.ke",
  "https://micmikespaints.co.ke",
  "http://localhost:5173",
  "http://localhost:3000",
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // --- Zod validation ---
  const validation = orderFormSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: "Validation failed",
      errors: getFieldErrors(validation.error),
    });
  }

  // --- Sanitize string fields ---
  const data = validation.data;
  const name    = sanitize(data.name);
  const email   = sanitizeEmail(data.email);
  const phone   = normaliseKenyanPhone(data.phone); // → 2547XXXXXXXX
  const county  = sanitize(data.county);
  const town    = sanitize(data.town);
  const address = sanitize(data.address);
  const items   = data.items;

  const sql = neon(process.env.DATABASE_URL!);

  // Server-side pricing — never trust client amounts
  const verified: {
    productId: string;
    colourId: string | null;
    size: string;
    finish: string;
    quantity: number;
    unitKes: number;
  }[] = [];

  for (const item of items) {
    const [row] = await sql`
      SELECT p.id AS product_id, v.price_kes
      FROM products p
      JOIN variants v ON v.product_id = p.id AND v.size = ${item.size}
      WHERE p.slug = ${item.productSlug} AND p.active = true
    `;
    if (!row)
      return res.status(400).json({ error: `Unknown product/size: ${item.productSlug} ${item.size}` });

    const [colour] = item.colourId
      ? await sql`SELECT id FROM colours WHERE id = ${item.colourId}`
      : [null];

    verified.push({
      productId: row.product_id,
      colourId:  colour?.id ?? null,
      size:      item.size,
      finish:    sanitize(String(item.finish ?? "Matte")).slice(0, 30),
      quantity:  item.quantity,
      unitKes:   row.price_kes,
    });
  }

  const subtotalKes = verified.reduce((s, i) => s + i.unitKes * i.quantity, 0);
  const deliveryKes = subtotalKes >= FREE_DELIVERY_MIN ? 0 : DELIVERY_FEE;
  const totalKes    = subtotalKes + deliveryKes;

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

  const d   = new Date(order.created_at);
  const ref = `INV-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(order.id).replace(/-/g, "").slice(-4).toUpperCase()}`;

  res.status(201).json({ orderId: order.id, reference: ref, subtotalKes, deliveryKes, totalKes });
}
