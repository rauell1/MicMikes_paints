import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";

function signToken(): string {
  const payload = String(Date.now());
  const sig = crypto.createHmac("sha256", process.env.ADMIN_JWT_SECRET!).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { password } = req.body ?? {};
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid password" });
  }
  return res.json({ token: signToken() });
}
