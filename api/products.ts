import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";

// ---------------------------------------------------------------------------
// Hardcoded fallback — returned when the DB has no products yet.
// Replace with real DB data by running: npm run db:seed:catalogue
// ---------------------------------------------------------------------------
const FALLBACK_PRODUCTS = [
  {
    id: "fallback-1",
    slug: "keekorok-matte-emulsion",
    name: "Keekorok Matte Emulsion",
    blurb: "Smooth, washable flat finish for interior walls.",
    category: "interior",
    image: null,
    baseKes: { "1L": 950, "4L": 3200, "20L": 13500 },
  },
  {
    id: "fallback-2",
    slug: "satin-silk-finish",
    name: "Satin Silk Finish",
    blurb: "Low-sheen satin for living areas and bedrooms.",
    category: "interior",
    image: null,
    baseKes: { "1L": 1100, "4L": 3800, "20L": 16000 },
  },
  {
    id: "fallback-3",
    slug: "eggshell-heritage",
    name: "Eggshell Heritage",
    blurb: "Classic eggshell sheen, perfect for trim and woodwork.",
    category: "interior",
    image: null,
    baseKes: { "1L": 1050, "4L": 3500, "20L": 14500 },
  },
  {
    id: "fallback-4",
    slug: "semi-gloss-acrylic",
    name: "Semi-Gloss Acrylic",
    blurb: "Durable semi-gloss for kitchens, bathrooms and exterior trim.",
    category: "exterior",
    image: null,
    baseKes: { "1L": 1200, "4L": 4200, "20L": 17500 },
  },
  {
    id: "fallback-5",
    slug: "weathershield-exterior",
    name: "Weathershield Exterior",
    blurb: "All-weather protection for exterior masonry and render.",
    category: "exterior",
    image: null,
    baseKes: { "1L": 1350, "4L": 4800, "20L": 20000 },
  },
  {
    id: "fallback-6",
    slug: "universal-primer",
    name: "Universal Primer",
    blurb: "Multi-surface adhesion primer for interior and exterior use.",
    category: "primer",
    image: null,
    baseKes: { "1L": 800, "4L": 2600, "20L": 10500 },
  },
];

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");

  try {
    const sql = neon(process.env.DATABASE_URL!);

    const products = await sql`
      SELECT id, slug, name, blurb, category, image_url AS "image"
      FROM products
      WHERE active = true
      ORDER BY created_at
    `;

    // --- Fallback: DB is empty, return hardcoded catalogue ---
    if (!products.length) {
      return res.json(FALLBACK_PRODUCTS);
    }

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

    return res.json(result);
  } catch (err) {
    console.error("[api/products] DB error, using fallback:", err);
    return res.json(FALLBACK_PRODUCTS);
  }
}
