import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";

const ALLOWED_ORIGINS = [
  "https://mic-mikes-paints.vercel.app",
  "https://www.micmikespaints.co.ke",
  "https://micmikespaints.co.ke",
  "http://localhost:5173",
  "http://localhost:3000",
];

function cors(req: VercelRequest, res: VercelResponse, methods = "POST, GET, OPTIONS") {
  const origin = req.headers.origin ?? "";
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (/^0(7\d|1[01])\d{7}$/.test(digits)) return "254" + digits.slice(1);
  if (/^254(7\d|1[01])\d{7}$/.test(digits)) return digits;
  throw new Error(
    `Invalid Kenyan mobile number: "${raw}". Expected 07xxxxxxxx, 010xxxxxxx, 011xxxxxxx or the 254 equivalent.`
  );
}

function getEATTimestamp(): string {
  const eat = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    eat.getUTCFullYear() +
    p(eat.getUTCMonth() + 1) +
    p(eat.getUTCDate()) +
    p(eat.getUTCHours()) +
    p(eat.getUTCMinutes()) +
    p(eat.getUTCSeconds())
  );
}

function generatePassword(shortCode: string, passKey: string, timestamp: string): string {
  return Buffer.from(`${shortCode}${passKey}${timestamp}`).toString("base64");
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAccessToken(): Promise<string> {
  const isProd = process.env.MPESA_ENVIRONMENT === "production";
  const base = isProd ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
  const credentials = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString("base64");
  const res = await fetchWithTimeout(
    `${base}/oauth/v1/generate?grant_type=client_credentials`,
    { method: "GET", headers: { Authorization: `Basic ${credentials}` } }
  );
  if (!res.ok) throw new Error(`M-Pesa OAuth failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

/* ────────────────────────────────────────────────────────────────────────────
   HANDLER
   POST /api/mpesa/stkpush            — initiate STK push
   GET  /api/mpesa/stkpush?_r=status&id=<checkoutRequestId>  — poll status
   The old URL /api/mpesa/status/:id is rewritten by vercel.json → ?_r=status&id=:id
──────────────────────────────────────────────────────────────────────────── */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();

  /* ── GET ?_r=status&id=<checkoutRequestId> ─────────────────────────────── */
  if (req.method === "GET" && req.query._r === "status") {
    const checkoutRequestId = req.query.id as string | undefined;
    if (!checkoutRequestId)
      return res.status(400).json({ error: "id (checkoutRequestId) is required" });
    if (!process.env.DATABASE_URL)
      return res.status(503).json({ error: "Database not configured" });

    const sql = neon(process.env.DATABASE_URL!);
    const [payment] = await sql`
      SELECT mp.status, mp.mpesa_receipt, mp.failure_reason, mp.result_code,
             mp.amount_kes, mp.completed_at,
             o.id AS order_id, o.name AS customer_name, o.total_kes
      FROM mpesa_payments mp
      JOIN orders o ON o.id = mp.order_id
      WHERE mp.checkout_request_id = ${checkoutRequestId}
    `;
    if (!payment) return res.status(404).json({ error: "Payment not found" });

    return res.status(200).json({
      status:        (payment.status as string).toLowerCase(),
      receipt:       payment.mpesa_receipt ?? null,
      failureReason: payment.failure_reason ?? null,
      amountKes:     payment.amount_kes,
      completedAt:   payment.completed_at ?? null,
      orderId:       payment.order_id,
      customerName:  payment.customer_name,
      totalKes:      payment.total_kes,
    });
  }

  /* ── POST — initiate STK push ───────────────────────────────────────────── */
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const required = ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_SHORTCODE", "MPESA_PASSKEY", "DATABASE_URL"];
  for (const key of required) {
    if (!process.env[key]) {
      console.error(`[mpesa/stkpush] Missing env var: ${key}`);
      return res.status(503).json({ error: "Payment service not configured" });
    }
  }

  const { orderId, phone, amountKes } = req.body as { orderId: string; phone: string; amountKes: number };
  if (!orderId || !phone || !amountKes)
    return res.status(400).json({ error: "orderId, phone and amountKes are required" });

  const amount = Math.round(amountKes);
  if (!Number.isInteger(amount) || amount <= 0)
    return res.status(400).json({ error: "amountKes must be a positive number" });

  let normalisedPhone: string;
  try { normalisedPhone = normalisePhone(String(phone)); }
  catch (err) { return res.status(400).json({ error: (err as Error).message }); }

  const sql = neon(process.env.DATABASE_URL!);
  const [order] = await sql`SELECT id, total_kes FROM orders WHERE id = ${orderId}`;
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.total_kes !== amount)
    return res.status(400).json({ error: `Amount mismatch: order total is KES ${order.total_kes}, got KES ${amount}` });

  const isProd = process.env.MPESA_ENVIRONMENT === "production";
  const base = isProd ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
  const shortCode = process.env.MPESA_SHORTCODE!;
  const passKey   = process.env.MPESA_PASSKEY!;
  const timestamp = getEATTimestamp();
  const password  = generatePassword(shortCode, passKey, timestamp);

  const callbackUrl = process.env.MPESA_CALLBACK_URL;
  if (!callbackUrl && !isProd) {
    console.error("[mpesa/stkpush] MPESA_CALLBACK_URL must be set in non-production environments");
    return res.status(503).json({ error: "Payment service not configured (missing callback URL)" });
  }
  const resolvedCallbackUrl =
    callbackUrl ?? "https://mic-mikes-paints.vercel.app/api/mpesa/callback";

  let accessToken: string;
  try { accessToken = await fetchAccessToken(); }
  catch (err) {
    console.error("[mpesa/stkpush] OAuth error:", err);
    return res.status(502).json({ error: "Could not reach M-Pesa. Please try again." });
  }

  const stkBody = {
    BusinessShortCode: shortCode,
    Password:          password,
    Timestamp:         timestamp,
    TransactionType:   "CustomerPayBillOnline",
    Amount:            amount,
    PartyA:            normalisedPhone,
    PartyB:            shortCode,
    PhoneNumber:       normalisedPhone,
    CallBackURL:       resolvedCallbackUrl,
    AccountReference:  `MicMikes-${String(orderId).slice(-6).toUpperCase()}`,
    TransactionDesc:   "Paint order payment",
  };

  let stkRes: Response;
  try {
    stkRes = await fetchWithTimeout(
      `${base}/mpesa/stkpush/v1/processrequest`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body:    JSON.stringify(stkBody),
      }
    );
  } catch (err) {
    console.error("[mpesa/stkpush] STK Push fetch error (timeout?):", err);
    return res.status(502).json({ error: "M-Pesa did not respond in time. Please try again." });
  }

  const stkData = (await stkRes.json()) as {
    ResponseCode?: string; ResponseDescription?: string;
    MerchantRequestID?: string; CheckoutRequestID?: string;
    CustomerMessage?: string; errorCode?: string; errorMessage?: string;
  };

  if (!stkRes.ok || stkData.errorCode) {
    console.error("[mpesa/stkpush] STK Push rejected:", stkData);
    return res.status(502).json({ error: stkData.errorMessage ?? "STK Push failed. Please try again." });
  }
  if (stkData.ResponseCode !== "0") {
    console.error("[mpesa/stkpush] Non-zero ResponseCode:", stkData);
    return res.status(502).json({ error: stkData.ResponseDescription ?? "STK Push rejected" });
  }

  await sql`
    INSERT INTO mpesa_payments (order_id, checkout_request_id, merchant_request_id, phone, amount_kes)
    VALUES (${orderId}, ${stkData.CheckoutRequestID!}, ${stkData.MerchantRequestID!}, ${normalisedPhone}, ${amount})
    ON CONFLICT (checkout_request_id) DO NOTHING
  `;
  await sql`
    INSERT INTO order_events (order_id, event_type, payload)
    VALUES (${orderId}, 'mpesa_initiated',
      ${JSON.stringify({ checkoutRequestId: stkData.CheckoutRequestID, phone: normalisedPhone })}::jsonb)
  `;

  return res.status(200).json({
    checkoutRequestId: stkData.CheckoutRequestID,
    customerMessage:   stkData.CustomerMessage ?? "Please check your phone and enter your M-Pesa PIN.",
  });
}
