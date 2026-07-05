import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import {
  orderFormSchema,
  enquiryFormSchema,
  getFieldErrors,
  normaliseKenyanPhone,
} from "../src/lib/validation.js";
import { sanitize, sanitizeEmail } from "../src/lib/sanitize.js";

const DEFAULT_DELIVERY_FEE = 0; // fallback if no rate configured

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

  if (req.query.type === "enquiry") {
    return handleEnquiry(req, res);
  }

  return handleOrder(req, res);
}

async function handleEnquiry(req: VercelRequest, res: VercelResponse) {
  const validation = enquiryFormSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: "Validation failed",
      errors: getFieldErrors(validation.error),
    });
  }

  const { name, email, phone, message } = validation.data;
  const sanitized = {
    name:    sanitize(name),
    email:   sanitizeEmail(email),
    phone:   normaliseKenyanPhone(phone),
    message: sanitize(message),
  };
  console.log("[enquiry]", sanitized);
  return res.status(200).json({ success: true, message: "Enquiry received. We will be in touch shortly!" });
}

async function handleOrder(req: VercelRequest, res: VercelResponse) {
  const validation = orderFormSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: "Validation failed",
      errors: getFieldErrors(validation.error),
    });
  }

  const data    = validation.data;
  const name    = sanitize(data.name);
  const email   = sanitizeEmail(data.email);
  const phone   = normaliseKenyanPhone(data.phone);
  const county  = sanitize(data.county);
  const town    = sanitize(data.town);
  const address = sanitize(data.address);
  const items   = data.items;

  const sql = neon(process.env.DATABASE_URL!);

  // Look up delivery rate set by admin for this county/town
  let deliveryKes = DEFAULT_DELIVERY_FEE;
  try {
    const rateRows = await sql`
      SELECT rate_kes FROM delivery_rates
      WHERE LOWER(county) = LOWER(${county})
        AND (LOWER(town) = LOWER(${town}) OR town IS NULL)
      ORDER BY
        CASE WHEN town IS NOT NULL AND LOWER(town) = LOWER(${town}) THEN 0 ELSE 1 END
      LIMIT 1`;
    if (rateRows.length) deliveryKes = Number(rateRows[0].rate_kes);
  } catch {
    // delivery_rates table may not exist yet — keep default
  }

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

  return res.status(201).json({ orderId: order.id, reference: ref, subtotalKes, deliveryKes, totalKes });
}
