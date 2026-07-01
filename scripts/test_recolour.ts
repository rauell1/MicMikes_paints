import handler from "../api/recolour.js";
import fs from "fs";
import path from "path";

// Ensure scratch directory exists
const scratchDir = path.join(process.cwd(), "scripts", "scratch");
if (!fs.existsSync(scratchDir)) {
  fs.mkdirSync(scratchDir, { recursive: true });
}

const req = {
  method: "POST",
  body: {
    image_url: "https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1600", // Nairobi Classic
    paint_hex: "#B84A32", // Masai Red
    finish: "Satin"
  },
  headers: {},
  cookies: {}
} as any;

const res = {
  statusCode: 200,
  headers: {} as Record<string, string>,
  setHeader(name: string, value: string) {
    this.headers[name] = value;
    return this;
  },
  status(code: number) {
    this.statusCode = code;
    return this;
  },
  json(data: any) {
    console.log("Received JSON Response. Status Code:", this.statusCode);
    if (data.error) {
      console.error("API Error:", data.error);
    } else if (data.image) {
      const base64Data = data.image.replace(/^data:image\/jpeg;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      const outputPath = path.join(scratchDir, "nairobi_classic_masai_red_satin.jpg");
      fs.writeFileSync(outputPath, buffer);
      console.log(`SUCCESS! Saved recoloured output image to ${outputPath}`);
      console.log(`Output size: ${buffer.length} bytes`);
    } else {
      console.log("Unknown response format:", data);
    }
  },
  end() {
    console.log("Response ended. Status Code:", this.statusCode);
  }
} as any;

console.log("Running local Vercel handler test...");
handler(req, res)
  .then(() => console.log("Test execution finished."))
  .catch(console.error);
