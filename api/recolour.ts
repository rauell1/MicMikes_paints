import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import fs from "fs";
import path from "path";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

// Helper HSL conversion functions
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hf = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [
    Math.round(hf(h + 1 / 3) * 255),
    Math.round(hf(h) * 255),
    Math.round(hf(h - 1 / 3) * 255)
  ];
}

// Polygon check helpers
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

// Core recolouring function
export function recolourImage(
  imageBuffer: Buffer,
  maskOptions: {
    pngBuffer?: Buffer;
    polyStr?: string;
  },
  paintHex: string,
  finish: string
): Buffer {
  // Decode original image
  const rawImage = jpeg.decode(imageBuffer);
  const { width, height, data } = rawImage;

  // Prepare mask array (values 0-255)
  const mask = new Uint8Array(width * height);

  if (maskOptions.pngBuffer) {
    // Decode PNG mask
    const png = PNG.sync.read(maskOptions.pngBuffer);
    
    // Resize/map PNG mask to raw image dimensions
    for (let y = 0; y < height; y++) {
      const py = Math.floor(y * png.height / height);
      for (let x = 0; x < width; x++) {
        const px = Math.floor(x * png.width / width);
        const idx = (py * png.width + px) * 4;
        
        // Use alpha channel or red channel to determine mask opacity
        const a = png.data[idx + 3];
        const r = png.data[idx];
        mask[y * width + x] = a > 10 ? r : 0;
      }
    }
  } else if (maskOptions.polyStr) {
    // Rasterize polygon coords
    const polys = maskOptions.polyStr
      .split(";")
      .map(s => parsePoly(s.trim()))
      .filter(p => p.length >= 3);

    for (let y = 0; y < height; y++) {
      const ny = y / height;
      for (let x = 0; x < width; x++) {
        const nx = x / width;
        const inside = polys.some(poly => inPoly(nx, ny, poly));
        mask[y * width + x] = inside ? 255 : 0;
      }
    }
  } else {
    // If no mask, paint everything (fallback, though unlikely to be used)
    mask.fill(255);
  }

  // Paint Swatch color HSL
  const [pr, pg, pb] = hexToRgb(paintHex);
  const [ph, ps, pl] = rgbToHsl(pr, pg, pb);

  // Sheen amount based on finish
  let sheenAmt = 0.12; // default Satin
  if (finish === "Matte") sheenAmt = 0.0;
  else if (finish === "Eggshell") sheenAmt = 0.05;
  else if (finish === "Satin") sheenAmt = 0.12;
  else if (finish === "Semi-Gloss") sheenAmt = 0.25;

  const l_base = 0.82; // off-white base lightness calibration

  // Apply recolouring loop
  for (let i = 0; i < mask.length; i++) {
    const maskVal = mask[i] / 255.0;
    if (maskVal === 0) continue;

    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    const [, , ol] = rgbToHsl(r, g, b);

    // Scaling the target lightness based on original lightness to preserve shadows & texture
    const newL = Math.max(0, Math.min(1, pl * (ol / l_base)));

    // Generate paint color at the adjusted lightness
    const [nr, ng, nb] = hslToRgb(ph, ps, newL);

    // Apply finish specular sheen on highlights
    const blendR = Math.round(nr + (255 - nr) * sheenAmt * ol);
    const blendG = Math.round(ng + (255 - ng) * sheenAmt * ol);
    const blendB = Math.round(nb + (255 - nb) * sheenAmt * ol);

    // Blend painted pixel with original based on mask feathering (maskVal)
    data[idx] = Math.round(r * (1 - maskVal) + blendR * maskVal);
    data[idx + 1] = Math.round(g * (1 - maskVal) + blendG * maskVal);
    data[idx + 2] = Math.round(b * (1 - maskVal) + blendB * maskVal);
  }

  // Re-encode modified RGBA buffer to JPEG
  const result = jpeg.encode(rawImage, 85);
  return result.data;
}

// Hugging Face Wall Segmentation API call
async function fetchMaskFromHF(imageUrl: string): Promise<Buffer | null> {
  try {
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) return null;
    const arrayBuffer = await imgResp.arrayBuffer();
    const imgBuffer = Buffer.from(arrayBuffer);

    const hfResp = await fetch(
      "https://api-inference.huggingface.co/models/nvidia/segformer-b5-finetuned-ade-640-640",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          ...(process.env.HF_TOKEN ? { "Authorization": `Bearer ${process.env.HF_TOKEN}` } : {})
        },
        body: imgBuffer
      }
    );

    if (!hfResp.ok) {
      console.error("HF segmentation API failed:", hfResp.status, await hfResp.text());
      return null;
    }

    const segments = await hfResp.json();
    if (!Array.isArray(segments)) return null;

    // Filter segments for 'wall' label
    const wallSegments = segments.filter(seg =>
      seg.label && seg.label.toLowerCase().includes("wall")
    );

    if (wallSegments.length === 0) return null;

    const firstMaskB64 = wallSegments[0].mask;
    if (!firstMaskB64) return null;

    return Buffer.from(firstMaskB64, "base64");
  } catch (err) {
    console.error("HF Fetch error:", err);
    return null;
  }
}

// Serverless Handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { image_url, paint_hex, finish } = req.body;

  if (!image_url || !paint_hex || !finish) {
    return res.status(400).json({ error: "Missing required fields: image_url, paint_hex, finish" });
  }

  // Simple Header-based API key Auth
  const apiKey = req.headers["x-api-key"] || (req.headers["authorization"] as string)?.replace("Bearer ", "");
  const expectedApiKey = process.env.RECOLOUR_API_KEY;
  if (expectedApiKey && apiKey !== expectedApiKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);

    // Check if the image matches one of the 5 static rooms (checking Pexels ID in URL)
    let staticRoomId: string | null = null;
    if (image_url.includes("1571460")) staticRoomId = "026feade-527d-42aa-a6fb-49055c05551d"; // Nairobi Classic
    else if (image_url.includes("271816")) staticRoomId = "a7417cd8-8977-4a06-9d19-f158fe8ec952"; // Mombasa Suite
    else if (image_url.includes("6186819")) staticRoomId = "10e15faf-1ccf-4c81-9db7-3a467164edab"; // Karen Bedroom
    else if (image_url.includes("7040696")) staticRoomId = "ee963068-197b-42c3-ad77-63f3fdf8c7db"; // Coastal Kitchen
    else if (image_url.includes("8146213")) staticRoomId = "b91aeb30-b245-4cf0-affc-5a04c8b0c2fd"; // Nairobi Living Room

    let maskBuffer: Buffer | undefined = undefined;
    let polyStr: string | undefined = undefined;

    if (staticRoomId) {
      // Try reading the static pre-generated PNG mask file from bundle using multiple potential paths
      const pathsToTry = [
        path.join(process.cwd(), "api", "masks", `${staticRoomId}_mask.png`),
        typeof __dirname !== "undefined" ? path.join(__dirname, "masks", `${staticRoomId}_mask.png`) : null,
        typeof __dirname !== "undefined" ? path.join(__dirname, "api", "masks", `${staticRoomId}_mask.png`) : null,
      ].filter((p): p is string => p !== null);

      for (const p of pathsToTry) {
        if (fs.existsSync(p)) {
          maskBuffer = fs.readFileSync(p);
          break;
        }
      }

      if (!maskBuffer) {
        // 2. If mask file not present, query the database for the polygon string
        const [room] = await sql`SELECT wall_mask FROM rooms WHERE id = ${staticRoomId}`;
        if (room?.wall_mask) {
          polyStr = room.wall_mask;
        }
      }
    } else {
      // It's a custom/uploaded image_url
      // 1. Check if the database has a room record matching this photo_url
      const [dbRoom] = await sql`SELECT wall_mask FROM rooms WHERE photo_url = ${image_url}`;
      if (dbRoom?.wall_mask) {
        if (dbRoom.wall_mask.startsWith("data:image/png;base64,")) {
          // It's a saved high-precision PNG mask
          const base64Data = dbRoom.wall_mask.replace(/^data:image\/png;base64,/, "");
          maskBuffer = Buffer.from(base64Data, "base64");
        } else {
          // It's a polygon mask string
          polyStr = dbRoom.wall_mask;
        }
      } else {
        // 2. Clean call to Hugging Face AI Segmentation on-demand
        const hfMask = await fetchMaskFromHF(image_url);
        if (hfMask) {
          maskBuffer = hfMask;
          // Dynamically cache this generated mask in the database if there's a matching room photo
          // to make subsequent recolours instant!
          const base64Mask = "data:image/png;base64," + hfMask.toString("base64");
          await sql`
            UPDATE rooms 
            SET wall_mask = ${base64Mask} 
            WHERE photo_url = ${image_url}
          `;
        }
      }
    }

    // Fetch the original room image
    const imgResp = await fetch(image_url);
    if (!imgResp.ok) {
      return res.status(404).json({ error: `Failed to download original image from URL: ${image_url}` });
    }
    const arrayBuffer = await imgResp.arrayBuffer();
    const originalImageBuffer = Buffer.from(arrayBuffer);

    // Apply photorealistic recolouring
    const processedBuffer = recolourImage(
      originalImageBuffer,
      { pngBuffer: maskBuffer, polyStr },
      paint_hex,
      finish
    );

    // Return the base64 JPEG
    res.json({
      image: "data:image/jpeg;base64," + processedBuffer.toString("base64")
    });
  } catch (err: any) {
    console.error("Recolour Handler Error:", err);
    res.status(500).json({ error: err.message || "Internal Server Error during processing" });
  }
}
