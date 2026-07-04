/**
 * Seed the `rooms` table with 4 Kenyan-interior Pexels photos.
 * Run once: npx tsx scripts/seed-rooms.ts
 *
 * Requires DATABASE_URL in your .env (same Neon connection string used by the app).
 */
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config();

const sql = neon(process.env.DATABASE_URL!);

const ROOMS = [
  {
    name: "Living Room",
    photo_url:
      "https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1400",
    sort_order: 1,
  },
  {
    name: "Bedroom",
    photo_url:
      "https://images.pexels.com/photos/271618/pexels-photo-271618.jpeg?auto=compress&cs=tinysrgb&w=1400",
    sort_order: 2,
  },
  {
    name: "Kitchen",
    photo_url:
      "https://images.pexels.com/photos/1080721/pexels-photo-1080721.jpeg?auto=compress&cs=tinysrgb&w=1400",
    sort_order: 3,
  },
  {
    name: "Home Office",
    photo_url:
      "https://images.pexels.com/photos/667838/pexels-photo-667838.jpeg?auto=compress&cs=tinysrgb&w=1400",
    sort_order: 4,
  },
];

// Ensure the rooms table exists (it should — created by drizzle migrations)
await sql`
  CREATE TABLE IF NOT EXISTS rooms (
    id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name      text NOT NULL,
    photo_url text NOT NULL,
    sort_order integer NOT NULL DEFAULT 0
  )
`;

let inserted = 0;
for (const room of ROOMS) {
  await sql`
    INSERT INTO rooms (name, photo_url, sort_order)
    VALUES (${room.name}, ${room.photo_url}, ${room.sort_order})
    ON CONFLICT DO NOTHING
  `;
  inserted++;
}

console.log(`✓ Seeded ${inserted} rooms into the database`);
ROOMS.forEach((r) => console.log(`  [${r.sort_order}] ${r.name} → ${r.photo_url}`));
