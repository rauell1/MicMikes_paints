import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

const [colours] = await sql`SELECT count(*)::int AS n FROM colours`;
const [products] = await sql`SELECT count(*)::int AS n FROM products`;
const [variants] = await sql`SELECT count(*)::int AS n FROM variants`;
const [rooms] = await sql`SELECT count(*)::int AS n FROM rooms`;

console.log("colours:", colours.n);
console.log("products:", products.n);
console.log("variants:", variants.n);
console.log("rooms:", rooms.n);
