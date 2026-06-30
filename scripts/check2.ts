import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

const [pc] = await sql`SELECT count(*)::int AS n FROM product_colours`;
const products = await sql`SELECT slug, name, image_url FROM products ORDER BY created_at`;
const rooms = await sql`SELECT name, photo_url FROM rooms ORDER BY sort_order`;

console.log("product_colours:", pc.n);
console.log("products:", JSON.stringify(products, null, 2));
console.log("rooms:", JSON.stringify(rooms, null, 2));
