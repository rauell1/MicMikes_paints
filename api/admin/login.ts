import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";

function signToken(): string {
  const payload = String(Date.now());
  const sig = crypto.createHmac("sha256", process.env.ADMIN_JWT_SECRET!).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const lastDot = decoded.lastIndexOf(".");
    const payload = decoded.slice(0, lastDot);
    const sig = decoded.slice(lastDot + 1);
    const expected = crypto.createHmac("sha256", process.env.ADMIN_JWT_SECRET!).update(payload).digest("hex");
    const sigBuf = Buffer.from(sig, "hex");
    const expBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expBuf.length || sigBuf.length === 0) return false;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;
    const ts = parseInt(payload, 10);
    return !isNaN(ts) && Date.now() - ts < 24 * 60 * 60 * 1000;
  } catch { return false; }
}

const COOKIE = "mm-admin-token";
const cookieOpts = "HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    const ok = verifyToken(req.cookies?.[COOKIE] as string | undefined);
    return ok ? res.json({ ok: true }) : res.status(401).json({ error: "Unauthorized" });
  }
  if (req.method === "POST") {
    const { password } = req.body ?? {};
    if (!password || password !== process.env.ADMIN_PASSWORD)
      return res.status(401).json({ error: "Invalid password" });
    const token = signToken();
    res.setHeader("Set-Cookie", `${COOKIE}=${token}; ${cookieOpts}`);
    return res.json({ ok: true });
  }
  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
    return res.json({ ok: true });
  }
  return res.status(405).end();
}
