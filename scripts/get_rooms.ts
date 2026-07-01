import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);
const rows = await sql`SELECT id, name, photo_url, wall_mask FROM rooms`;
console.log(JSON.stringify(rows, null, 2));
