/**
 * Seed product_colours — links every paint product to all 20 colours.
 * Primer and Supplies are excluded (no colour variants).
 * Run: npm run db:seed
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

const paintSlugs = [
  "keekorok-matte-emulsion",
  "satin-silk-finish",
  "eggshell-heritage",
  "semi-gloss-acrylic",
];

const paintProducts = await sql`
  SELECT id FROM products WHERE slug = ANY(${paintSlugs})
`;

const allColours = await sql`SELECT id FROM colours`;

if (!paintProducts.length) {
  console.error("No paint products found — run the app seed first");
  process.exit(1);
}

let inserted = 0;
for (const product of paintProducts) {
  for (const colour of allColours) {
    await sql`
      INSERT INTO product_colours (product_id, colour_id)
      VALUES (${product.id}, ${colour.id})
      ON CONFLICT DO NOTHING
    `;
    inserted++;
  }
}

console.log(`Seeded ${inserted} product_colour links`);
console.log(`${paintProducts.length} products × ${allColours.length} colours`);
