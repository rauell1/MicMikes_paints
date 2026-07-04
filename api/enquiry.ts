import type { VercelRequest, VercelResponse } from "@vercel/node";
import { enquiryFormSchema, getFieldErrors, normaliseKenyanPhone } from "../src/lib/validation.js";
import { sanitize, sanitizeEmail } from "../src/lib/sanitize.js";

const ALLOWED_ORIGINS = [
  "https://mic-mikes-paints.vercel.app",
  "https://www.micmikespaints.co.ke",
  "https://micmikespaints.co.ke",
  "http://localhost:5173",
  "http://localhost:3000",
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const validation = enquiryFormSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: "Validation failed",
      errors: getFieldErrors(validation.error),
    });
  }

  const { name, email, phone, message } = validation.data;

  const sanitized = {
    name:    sanitize(name),
    email:   sanitizeEmail(email),
    phone:   normaliseKenyanPhone(phone), // stored as 2547XXXXXXXX
    message: sanitize(message),
  };

  // TODO: wire up email delivery (e.g. Resend / SendGrid) or save to DB
  console.log("[enquiry]", sanitized);

  return res.status(200).json({ success: true, message: "Enquiry received. We will be in touch shortly!" });
}
