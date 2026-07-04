/**
 * Seed the full Mic & Mike's Paints catalogue:
 *   - colours  (20 paint colours across 8 families)
 *   - products (6 products: interior, exterior, primer)
 *   - variants (1L / 4L / 20L per product)
 *
 * All inserts are idempotent — safe to re-run.
 * Run: npm run db:seed:catalogue
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

// ---------------------------------------------------------------------------
// 1. Colours
// ---------------------------------------------------------------------------
const COLOURS = [
  // Whites & Neutrals
  { code: "MM-W01",  name: "Brilliant White",  hex: "#F8F8F6", family: "Whites" },
  { code: "MM-W02",  name: "Antique White",    hex: "#F5F0E8", family: "Whites" },
  { code: "MM-W03",  name: "Ivory Cream",      hex: "#F4EDD8", family: "Whites" },
  { code: "MM-N01",  name: "Stone Grey",       hex: "#C9C5BE", family: "Neutrals" },
  { code: "MM-N02",  name: "Warm Pebble",      hex: "#B8B0A4", family: "Neutrals" },
  { code: "MM-N03",  name: "Slate",            hex: "#8C8882", family: "Neutrals" },
  // Browns
  { code: "MM-B01",  name: "Desert Sand",      hex: "#D4B896", family: "Browns" },
  { code: "MM-B02",  name: "Warm Caramel",     hex: "#B8845A", family: "Browns" },
  { code: "MM-B03",  name: "Dark Walnut",      hex: "#6B4423", family: "Browns" },
  // Greens
  { code: "MM-G01",  name: "Mint Breeze",      hex: "#C8DDD0", family: "Greens" },
  { code: "MM-G02",  name: "Sage Meadow",      hex: "#8FAF90", family: "Greens" },
  { code: "MM-G03",  name: "Forest Deep",      hex: "#3A6B4A", family: "Greens" },
  // Blues
  { code: "MM-BL01", name: "Sky Mist",         hex: "#C5D8E8", family: "Blues" },
  { code: "MM-BL02", name: "Ocean Breeze",     hex: "#6B9AB8", family: "Blues" },
  { code: "MM-BL03", name: "Deep Navy",        hex: "#1E3A5F", family: "Blues" },
  // Yellows & Oranges
  { code: "MM-Y01",  name: "Sunflower",        hex: "#F5D76E", family: "Yellows" },
  { code: "MM-Y02",  name: "Mango",            hex: "#F4A135", family: "Yellows" },
  { code: "MM-O01",  name: "Terracotta",       hex: "#C8623A", family: "Oranges" },
  // Reds & Pinks
  { code: "MM-R01",  name: "Rose Blush",       hex: "#E8B4B0", family: "Reds" },
  { code: "MM-R02",  name: "Crimson",          hex: "#9B2335", family: "Reds" },
];

console.log("\u25b6 Seeding colours...");
for (const c of COLOURS) {
  await sql`
    INSERT INTO colours (code, name, hex, family)
    VALUES (${c.code}, ${c.name}, ${c.hex}, ${c.family})
    ON CONFLICT (code) DO NOTHING
  `;
}
console.log(`  \u2713 ${COLOURS.length} colours done`);

// ---------------------------------------------------------------------------
// 2. Products
// ---------------------------------------------------------------------------
const PRODUCTS = [
  {
    slug: "keekorok-matte-emulsion",
    name: "Keekorok Matte Emulsion",
    blurb: "Smooth, washable flat finish for interior walls.",
    category: "interior",
  },
  {
    slug: "satin-silk-finish",
    name: "Satin Silk Finish",
    blurb: "Low-sheen satin for living areas and bedrooms.",
    category: "interior",
  },
  {
    slug: "eggshell-heritage",
    name: "Eggshell Heritage",
    blurb: "Classic eggshell sheen, perfect for trim and woodwork.",
    category: "interior",
  },
  {
    slug: "semi-gloss-acrylic",
    name: "Semi-Gloss Acrylic",
    blurb: "Durable semi-gloss for kitchens, bathrooms and exterior trim.",
    category: "exterior",
  },
  {
    slug: "weathershield-exterior",
    name: "Weathershield Exterior",
    blurb: "All-weather protection for exterior masonry and render.",
    category: "exterior",
  },
  {
    slug: "universal-primer",
    name: "Universal Primer",
    blurb: "Multi-surface adhesion primer for interior and exterior use.",
    category: "primer",
  },
];

console.log("\u25b6 Seeding products...");
for (const p of PRODUCTS) {
  await sql`
    INSERT INTO products (slug, name, blurb, category, active)
    VALUES (${p.slug}, ${p.name}, ${p.blurb}, ${p.category}, true)
    ON CONFLICT (slug) DO NOTHING
  `;
}
console.log(`  \u2713 ${PRODUCTS.length} products done`);

// ---------------------------------------------------------------------------
// 3. Variants (1L / 4L / 20L per product)
// ---------------------------------------------------------------------------
const VARIANT_PRICES: Record<string, { "1L": number; "4L": number; "20L": number }> = {
  "keekorok-matte-emulsion": { "1L": 950,  "4L": 3200,  "20L": 13500 },
  "satin-silk-finish":       { "1L": 1100, "4L": 3800,  "20L": 16000 },
  "eggshell-heritage":       { "1L": 1050, "4L": 3500,  "20L": 14500 },
  "semi-gloss-acrylic":      { "1L": 1200, "4L": 4200,  "20L": 17500 },
  "weathershield-exterior":  { "1L": 1350, "4L": 4800,  "20L": 20000 },
  "universal-primer":        { "1L": 800,  "4L": 2600,  "20L": 10500 },
};

console.log("\u25b6 Seeding variants...");
let variantCount = 0;
for (const p of PRODUCTS) {
  const [product] = await sql`SELECT id FROM products WHERE slug = ${p.slug}`;
  if (!product) { console.warn(`  ! product not found: ${p.slug}`); continue; }

  const prices = VARIANT_PRICES[p.slug];
  for (const [size, priceKes] of Object.entries(prices)) {
    await sql`
      INSERT INTO variants (product_id, size, price_kes)
      VALUES (${product.id}, ${size}, ${priceKes})
      ON CONFLICT (product_id, size) DO NOTHING
    `;
    variantCount++;
  }
}
console.log(`  \u2713 ${variantCount} variants done`);

// ---------------------------------------------------------------------------
// 4. product_colours — link all paint products to all colours
// ---------------------------------------------------------------------------
const paintSlugs = [
  "keekorok-matte-emulsion",
  "satin-silk-finish",
  "eggshell-heritage",
  "semi-gloss-acrylic",
  "weathershield-exterior",
];

console.log("\u25b6 Seeding product_colours...");
const paintProducts = await sql`SELECT id FROM products WHERE slug = ANY(${paintSlugs})`;
const allColours    = await sql`SELECT id FROM colours`;
let linkCount = 0;
for (const product of paintProducts) {
  for (const colour of allColours) {
    await sql`
      INSERT INTO product_colours (product_id, colour_id)
      VALUES (${product.id}, ${colour.id})
      ON CONFLICT DO NOTHING
    `;
    linkCount++;
  }
}
console.log(`  \u2713 ${linkCount} product_colour links done`);

console.log("\n\u2705 Catalogue seeded successfully!");
console.log(`   ${COLOURS.length} colours  |  ${PRODUCTS.length} products  |  ${variantCount} variants  |  ${linkCount} colour links`);
