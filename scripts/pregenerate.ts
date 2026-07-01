import { neon } from "@neondatabase/serverless";
import fs from "fs";
import path from "path";
import { recolourImage } from "../api/recolour.js";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("Starting batch visualizer image pre-generation...");

  const pregenDir = path.join(process.cwd(), "public", "pregenerated");
  if (!fs.existsSync(pregenDir)) {
    fs.mkdirSync(pregenDir, { recursive: true });
  }

  const scratchDir = path.join(process.cwd(), "scripts", "scratch", "original_rooms");
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }

  // 1. Query database for rooms and colours
  const rooms = await sql`SELECT id, name, photo_url, wall_mask FROM rooms`;
  const colours = await sql`SELECT id, name, hex FROM colours`;

  console.log(`Found ${rooms.length} rooms and ${colours.length} colours.`);
  console.log(`Total images to generate: ${rooms.length * colours.length}\n`);

  for (const room of rooms) {
    console.log(`----------------------------------------`);
    console.log(`Processing Room: ${room.name} (${room.id})`);
    
    // Load mask
    let maskBuffer: Buffer | undefined = undefined;
    let polyStr: string | undefined = undefined;

    const maskPath = path.join(process.cwd(), "api", "masks", `${room.id}_mask.png`);
    if (fs.existsSync(maskPath)) {
      maskBuffer = fs.readFileSync(maskPath);
      console.log(`Loaded local mask file: ${maskPath}`);
    } else if (room.wall_mask) {
      if (room.wall_mask.startsWith("data:image/png;base64,")) {
        const base64Data = room.wall_mask.replace(/^data:image\/png;base64,/, "");
        maskBuffer = Buffer.from(base64Data, "base64");
        console.log(`Loaded mask from database base64 PNG.`);
      } else {
        polyStr = room.wall_mask;
        console.log(`Using polygon mask from database.`);
      }
    } else {
      console.log(`WARNING: No mask found for room ${room.name}. Skipping.`);
      continue;
    }

    // Load original image
    const localImgPath = path.join(scratchDir, `${room.id}.jpg`);
    let originalImageBuffer: Buffer;

    if (fs.existsSync(localImgPath)) {
      originalImageBuffer = fs.readFileSync(localImgPath);
      console.log(`Loaded original image from local cache: ${localImgPath}`);
    } else {
      console.log(`Downloading original image from: ${room.photo_url}`);
      try {
        const imgResp = await fetch(room.photo_url);
        if (!imgResp.ok) {
          throw new Error(`HTTP ${imgResp.status}`);
        }
        const arrayBuffer = await imgResp.arrayBuffer();
        originalImageBuffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(localImgPath, originalImageBuffer);
        console.log(`Saved original image to cache: ${localImgPath}`);
      } catch (err: any) {
        console.error(`ERROR downloading image: ${err.message}`);
        console.log(`NOTE: If you are running inside the sandbox, outbound network requests to Pexels might be blocked.`);
        console.log(`To run this script successfully, please execute the following command on your local machine:`);
        console.log(`  node --env-file=.env --import=tsx/esm scripts/pregenerate.ts`);
        console.log(`Skipping room ${room.name}.\n`);
        continue;
      }
    }

    // Generate recoloured image for each colour
    let generatedCount = 0;
    for (const colour of colours) {
      const outputPath = path.join(pregenDir, `${room.id}_${colour.id}.jpg`);
      
      try {
        const processedBuffer = recolourImage(
          originalImageBuffer,
          { pngBuffer: maskBuffer, polyStr },
          colour.hex,
          "Satin" // Default visualizer finish
        );

        fs.writeFileSync(outputPath, processedBuffer);
        generatedCount++;
      } catch (err: any) {
        console.error(`  Failed to generate ${colour.name}: ${err.message}`);
      }
    }
    console.log(`Successfully generated ${generatedCount}/${colours.length} paint variants for ${room.name}`);
  }

  console.log(`\n========================================`);
  console.log(`Batch pre-generation complete! All images saved to: public/pregenerated/`);
}

main().catch(console.error);
