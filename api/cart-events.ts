import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";

const VALID_EVENTS = ["add", "remove", "update", "checkout_start", "checkout_complete"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { sessionId, eventType, productSlug, colourId, size, finish, quantity, unitKes } = req.body;

  if (!sessionId || !VALID_EVENTS.includes(eventType)) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const sql = neon(process.env.DATABASE_URL!);

  const [product] = productSlug
    ? await sql`SELECT id FROM products WHERE slug = ${productSlug}`
    : [null];

  await sql`
    INSERT INTO cart_events (session_id, event_type, product_id, colour_id, size, finish, quantity, unit_kes)
    VALUES (${sessionId}, ${eventType}, ${product?.id ?? null}, ${colourId ?? null},
            ${size ?? null}, ${finish ?? null}, ${quantity ?? null}, ${unitKes ?? null})
  `;

  res.status(201).json({ ok: true });
}
