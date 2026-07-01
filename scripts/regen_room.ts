import { neon } from "@neondatabase/serverless";
import fs from "fs";
import path from "path";
import { recolourImage } from "../api/recolour.js";

const ROOM_ID = process.argv[2];
if (!ROOM_ID) { console.error("Usage: regen_room.ts <room-id>"); process.exit(1); }

const sql = neon(process.env.DATABASE_URL!);

const [room] = await sql`SELECT id, name, photo_url FROM rooms WHERE id = ${ROOM_ID}`;
if (!room) { console.error("Room not found:", ROOM_ID); process.exit(1); }

const colours = await sql`SELECT id, name, hex FROM colours`;
console.log(`Regenerating ${colours.length} images for: ${room.name}`);

const maskPath = path.join(process.cwd(), "api", "masks", `${ROOM_ID}_mask.png`);
const maskBuffer = fs.readFileSync(maskPath);

const imgPath = path.join(process.cwd(), "scripts", "scratch", "original_rooms", `${ROOM_ID}.jpg`);
const originalImageBuffer = fs.readFileSync(imgPath);

const pregenDir = path.join(process.cwd(), "public", "pregenerated");
let count = 0;
for (const colour of colours) {
  const out = path.join(pregenDir, `${ROOM_ID}_${colour.id}.jpg`);
  const buf = recolourImage(originalImageBuffer, { pngBuffer: maskBuffer }, colour.hex, "Satin");
  fs.writeFileSync(out, buf);
  count++;
}
console.log(`Done: ${count}/${colours.length} images regenerated.`);
