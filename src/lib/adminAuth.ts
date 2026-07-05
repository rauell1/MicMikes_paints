import type { VercelRequest } from "@vercel/node";
import crypto from "crypto";

const COOKIE = "mm-admin-token";

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const lastDot = decoded.lastIndexOf(".");
    const payload = decoded.slice(0, lastDot);
    const sig = decoded.slice(lastDot + 1);
    const expected = crypto
      .createHmac("sha256", process.env.ADMIN_JWT_SECRET!)
      .update(payload)
      .digest("hex");
    const sigBuf = Buffer.from(sig, "hex");
    const expBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expBuf.length || sigBuf.length === 0) return false;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;
    const ts = parseInt(payload, 10);
    return !isNaN(ts) && Date.now() - ts < 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export async function verifyAdminSession(req: VercelRequest): Promise<boolean> {
  const token = req.cookies?.[COOKIE] as string | undefined;
  return verifyToken(token);
}
