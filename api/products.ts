import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const sql = neon(process.env.DATABASE_URL!);

  const products = await sql`
    SELECT id, slug, name, blurb, category, image_url AS "image"
    FROM products
    WHERE active = true
    ORDER BY created_at
  `;

  const variants = await sql`
    SELECT product_id AS "productId", size, price_kes AS "priceKes"
    FROM variants
    ORDER BY product_id, size
  `;

  const result = products.map(p => ({
    ...p,
    baseKes: Object.fromEntries(
      variants
        .filter(v => v.productId === p.id)
        .map(v => [v.size, v.priceKes])
    ),
  }));

  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
  res.json(result);
}
