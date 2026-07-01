import { neon } from "@neondatabase/serverless";
import fs from "fs";
import path from "path";
import { PNG } from "pngjs";

const sql = neon(process.env.DATABASE_URL!);

function inPoly(px: number, py: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (((yi > py) !== (yj > py)) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function parsePoly(maskStr: string): [number, number][] {
  return maskStr.trim().split(/\s+/).map(p => {
    const [x, y] = p.split(",").map(Number);
    return [x, y];
  });
}

async function main() {
  const rooms = await sql`SELECT id, name, wall_mask FROM rooms`;
  const masksDir = path.join(process.cwd(), "api", "masks");
  if (!fs.existsSync(masksDir)) {
    fs.mkdirSync(masksDir, { recursive: true });
  }

  // We will rasterize masks at a standard resolution (1200x750 or similar)
  const W = 1200;
  const H = 750;

  for (const room of rooms) {
    if (!room.wall_mask) {
      console.log(`Skipping ${room.name} (no wall_mask in DB)`);
      continue;
    }

    console.log(`Rasterizing mask for ${room.name}...`);
    const polys = room.wall_mask.split(";").map((s: string) => parsePoly(s.trim())).filter((p: any) => p.length >= 3);
    
    const png = new PNG({ width: W, height: H }); // Default RGBA
    
    for (let y = 0; y < H; y++) {
      const ny = y / H;
      for (let x = 0; x < W; x++) {
        const nx = x / W;
        const inside = polys.some((poly: any) => inPoly(nx, ny, poly));
        const idx = (y * W + x) * 4;
        const val = inside ? 255 : 0;
        png.data[idx] = val;     // R
        png.data[idx + 1] = val; // G
        png.data[idx + 2] = val; // B
        png.data[idx + 3] = 255; // A (Opaque)
      }
    }

    const filename = `${room.id}_mask.png`;
    const outputPath = path.join(masksDir, filename);
    png.pack().pipe(fs.createWriteStream(outputPath)).on("finish", () => {
      console.log(`Saved mask to ${outputPath}`);
    });
  }
}

main().catch(console.error);
