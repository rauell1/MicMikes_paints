import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";

// Hobby plan caps deployments at 12 serverless functions.
// This file handles all read-only catalogue endpoints:
//   GET /api/colours               — full colour list
//   GET /api/colours?popular=1     — top 5 colours (last 30 days)
//   GET /api/colours?type=rooms    — rooms for the visualizer
//   GET /api/colours?type=products — products + price variants (merged from
//                                    the old /api/products to free a fn slot)

// ---------------------------------------------------------------------------
// Hardcoded fallback — returned when the DB has no colours yet.
// Based on a representative Mic & Mike's Paints palette.
// Replace with real data by running: npm run db:seed:catalogue
// ---------------------------------------------------------------------------
const FALLBACK_COLOURS = [
  // Whites & Neutrals
  { id: "fc-01", code: "MM-W01", name: "Brilliant White",    hex: "#F8F8F6", family: "Whites" },
  { id: "fc-02", code: "MM-W02", name: "Antique White",      hex: "#F5F0E8", family: "Whites" },
  { id: "fc-03", code: "MM-W03", name: "Ivory Cream",        hex: "#F4EDD8", family: "Whites" },
  { id: "fc-04", code: "MM-N01", name: "Stone Grey",         hex: "#C9C5BE", family: "Neutrals" },
  { id: "fc-05", code: "MM-N02", name: "Warm Pebble",        hex: "#B8B0A4", family: "Neutrals" },
  { id: "fc-06", code: "MM-N03", name: "Slate",              hex: "#8C8882", family: "Neutrals" },
  // Browns & Beiges
  { id: "fc-07", code: "MM-B01", name: "Desert Sand",        hex: "#D4B896", family: "Browns" },
  { id: "fc-08", code: "MM-B02", name: "Warm Caramel",       hex: "#B8845A", family: "Browns" },
  { id: "fc-09", code: "MM-B03", name: "Dark Walnut",        hex: "#6B4423", family: "Browns" },
  // Greens
  { id: "fc-10", code: "MM-G01", name: "Mint Breeze",        hex: "#C8DDD0", family: "Greens" },
  { id: "fc-11", code: "MM-G02", name: "Sage Meadow",        hex: "#8FAF90", family: "Greens" },
  { id: "fc-12", code: "MM-G03", name: "Forest Deep",        hex: "#3A6B4A", family: "Greens" },
  // Blues
  { id: "fc-13", code: "MM-BL01", name: "Sky Mist",          hex: "#C5D8E8", family: "Blues" },
  { id: "fc-14", code: "MM-BL02", name: "Ocean Breeze",      hex: "#6B9AB8", family: "Blues" },
  { id: "fc-15", code: "MM-BL03", name: "Deep Navy",         hex: "#1E3A5F", family: "Blues" },
  // Yellows & Oranges
  { id: "fc-16", code: "MM-Y01", name: "Sunflower",          hex: "#F5D76E", family: "Yellows" },
  { id: "fc-17", code: "MM-Y02", name: "Mango",              hex: "#F4A135", family: "Yellows" },
  { id: "fc-18", code: "MM-O01", name: "Terracotta",         hex: "#C8623A", family: "Oranges" },
  // Reds & Pinks
  { id: "fc-19", code: "MM-R01", name: "Rose Blush",         hex: "#E8B4B0", family: "Reds" },
  { id: "fc-20", code: "MM-R02", name: "Crimson",            hex: "#9B2335", family: "Reds" },
];

const FALLBACK_ROOMS = [
  { id: "fr-01", name: "Living Room",  photo: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1200&q=80", wallMask: null },
  { id: "fr-02", name: "Bedroom",      photo: "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=1200&q=80", wallMask: null },
  { id: "fr-03", name: "Kitchen",      photo: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80", wallMask: null },
];

const FALLBACK_PRODUCTS = [
  { id: "fallback-1", slug: "keekorok-matte-emulsion", name: "Keekorok Matte Emulsion", blurb: "Smooth, washable flat finish for interior walls.", category: "interior", image: null, baseKes: { "1L": 950, "4L": 3200, "20L": 13500 } },
  { id: "fallback-2", slug: "satin-silk-finish", name: "Satin Silk Finish", blurb: "Low-sheen satin for living areas and bedrooms.", category: "interior", image: null, baseKes: { "1L": 1100, "4L": 3800, "20L": 16000 } },
  { id: "fallback-3", slug: "eggshell-heritage", name: "Eggshell Heritage", blurb: "Classic eggshell sheen, perfect for trim and woodwork.", category: "interior", image: null, baseKes: { "1L": 1050, "4L": 3500, "20L": 14500 } },
  { id: "fallback-4", slug: "semi-gloss-acrylic", name: "Semi-Gloss Acrylic", blurb: "Durable semi-gloss for kitchens, bathrooms and exterior trim.", category: "exterior", image: null, baseKes: { "1L": 1200, "4L": 4200, "20L": 17500 } },
  { id: "fallback-5", slug: "weathershield-exterior", name: "Weathershield Exterior", blurb: "All-weather protection for exterior masonry and render.", category: "exterior", image: null, baseKes: { "1L": 1350, "4L": 4800, "20L": 20000 } },
  { id: "fallback-6", slug: "universal-primer", name: "Universal Primer", blurb: "Multi-surface adhesion primer for interior and exterior use.", category: "primer", image: null, baseKes: { "1L": 800, "4L": 2600, "20L": 10500 } },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");

  try {
    const sql = neon(process.env.DATABASE_URL!);

    // --- Rooms (visualizer backgrounds) ---
    if (req.query.type === "rooms") {
      const rows = await sql`
        SELECT id, name, photo_url AS "photo", wall_mask AS "wallMask"
        FROM rooms
        ORDER BY sort_order
      `;
      if (!rows.length) return res.json(FALLBACK_ROOMS);
      return res.json(rows);
    }

    // --- Products + price variants ---
    if (req.query.type === "products") {
      const products = await sql`
        SELECT id, slug, name, blurb, category, image_url AS "image"
        FROM products
        WHERE active = true
        ORDER BY created_at
      `;
      if (!products.length) return res.json(FALLBACK_PRODUCTS);
      const variants = await sql`
        SELECT product_id AS "productId", size, price_kes AS "priceKes"
        FROM variants
        ORDER BY product_id, size
      `;
      const result = products.map((p) => ({
        ...p,
        baseKes: Object.fromEntries(
          variants.filter((v) => v.productId === p.id).map((v) => [v.size, v.priceKes])
        ),
      }));
      return res.json(result);
    }

    // --- Popular colour IDs (last 30 days) ---
    if (req.query.popular) {
      const rows = await sql`
        SELECT colour_id,
               SUM(CASE WHEN event_type = 'add' THEN 3 ELSE 1 END) AS score
        FROM cart_events
        WHERE colour_id IS NOT NULL
          AND event_type IN ('add', 'swatch_click')
          AND created_at > NOW() - INTERVAL '30 days'
        GROUP BY colour_id
        ORDER BY score DESC
        LIMIT 5
      `;
      // Fallback: return first 5 fallback colour IDs
      if (!rows.length) return res.json(FALLBACK_COLOURS.slice(0, 5).map(c => c.id));
      return res.json(rows.map((r) => r.colour_id));
    }

    // --- Full colour list ---
    const rows = await sql`
      SELECT id, code, name, hex, family
      FROM colours
      ORDER BY family, name
    `;
    if (!rows.length) return res.json(FALLBACK_COLOURS);
    return res.json(rows);

  } catch (err) {
    console.error("[api/colours] DB error, using fallback:", err);
    if (req.query.type === "rooms") return res.json(FALLBACK_ROOMS);
    if (req.query.type === "products") return res.json(FALLBACK_PRODUCTS);
    if (req.query.popular) return res.json(FALLBACK_COLOURS.slice(0, 5).map(c => c.id));
    return res.json(FALLBACK_COLOURS);
  }
}
