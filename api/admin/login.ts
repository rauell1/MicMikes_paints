import type { VercelRequest, VercelResponse } from "@vercel/node";
import { signToken } from "../_lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { password } = req.body ?? {};
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid password" });
  }
  return res.json({ token: signToken() });
}
