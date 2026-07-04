import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";

const ALLOWED_ORIGINS = [
  "https://mic-mikes-paints.vercel.app",
  "https://www.micmikespaints.co.ke",
  "https://micmikespaints.co.ke",
  "http://localhost:5173",
  "http://localhost:3000",
];

function cors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin ?? "";
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

async function fetchAccessToken(): Promise<string> {
  const isProd = process.env.MPESA_ENVIRONMENT === "production";
  const base = isProd ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
  const credentials = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString("base64");
  const res = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    method: "GET",
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (!res.ok) throw new Error(`M-Pesa OAuth failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

function resultCodeToStatus(code: number): string {
  switch (code) {
    case 0:    return "SUCCESS";
    case 1032: return "CANCELLED";
    case 1037: return "TIMEOUT";
    case 1019: return "EXPIRED";
    default:   return "FAILED";
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function initiate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const required = ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_SHORTCODE", "MPESA_PASSKEY", "DATABASE_URL"];
  for (const key of required) {
    if (!process.env[key]) {
      console.error(`[mpesa/initiate] Missing env var: ${key}`);
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
  const base   = isProd ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
  const shortCode = process.env.MPESA_SHORTCODE!;
  const passKey   = process.env.MPESA_PASSKEY!;
  const timestamp = getEATTimestamp();
  const password  = generatePassword(shortCode, passKey, timestamp);

  let accessToken: string;
  try { accessToken = await fetchAccessToken(); }
  catch (err) {
    console.error("[mpesa/initiate] OAuth error:", err);
    return res.status(502).json({ error: "Could not reach M-Pesa. Please try again." });
  }

  const callbackUrl =
    process.env.MPESA_CALLBACK_URL ??
    `https://mic-mikes-paints.vercel.app/api/mpesa?action=callback`;

  const stkBody = {
    BusinessShortCode: shortCode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: amount,
    PartyA: normalisedPhone,
    PartyB: shortCode,
    PhoneNumber: normalisedPhone,
    CallBackURL: callbackUrl,
    AccountReference: `MicMikes-${String(orderId).slice(-6).toUpperCase()}`,
    TransactionDesc: "Paint order payment",
  };

  const stkRes = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(stkBody),
  });

  const stkData = (await stkRes.json()) as {
    ResponseCode?: string; ResponseDescription?: string;
    MerchantRequestID?: string; CheckoutRequestID?: string;
    CustomerMessage?: string; errorCode?: string; errorMessage?: string;
  };

  if (!stkRes.ok || stkData.errorCode) {
    console.error("[mpesa/initiate] STK Push rejected:", stkData);
    return res.status(502).json({ error: stkData.errorMessage ?? "STK Push failed. Please try again." });
  }
  if (stkData.ResponseCode !== "0") {
    console.error("[mpesa/initiate] Non-zero ResponseCode:", stkData);
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
    customerMessage: stkData.CustomerMessage ?? "Please check your phone and enter your M-Pesa PIN.",
  });
}

// ---------------------------------------------------------------------------

async function callback(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(200).end();
  const ack = () => res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });

  if (!process.env.DATABASE_URL) { console.error("[mpesa/callback] DATABASE_URL not set"); return ack(); }

  const body = req.body as {
    Body?: { stkCallback?: {
      MerchantRequestID?: string; CheckoutRequestID?: string;
      ResultCode?: number; ResultDesc?: string;
      CallbackMetadata?: { Item?: Array<{ Name: string; Value?: string | number }> };
    }};
  };

  const cb = body?.Body?.stkCallback;
  if (!cb?.CheckoutRequestID || !cb?.MerchantRequestID || cb?.ResultCode === undefined) {
    console.error("[mpesa/callback] Malformed body:", JSON.stringify(body));
    return ack();
  }

  const sql = neon(process.env.DATABASE_URL!);
  const [payment] = await sql`
    SELECT id, order_id, amount_kes, status FROM mpesa_payments
    WHERE checkout_request_id = ${cb.CheckoutRequestID}
  `;

  if (!payment) { console.warn("[mpesa/callback] Unknown CheckoutRequestID:", cb.CheckoutRequestID); return ack(); }
  if (payment.status !== "PENDING") { console.warn("[mpesa/callback] Duplicate — already", payment.status); return ack(); }

  const status = resultCodeToStatus(cb.ResultCode);
  const now    = new Date().toISOString();

  if (cb.ResultCode === 0) {
    const items  = cb.CallbackMetadata?.Item ?? [];
    const get    = (name: string) => items.find((i) => i.Name === name)?.Value;
    const receipt        = get("MpesaReceiptNumber") as string | undefined;
    const callbackAmount = get("Amount") as number | undefined;

    if (callbackAmount !== undefined && Math.abs(callbackAmount - payment.amount_kes) > 1) {
      console.error(`[mpesa/callback] Amount mismatch: expected ${payment.amount_kes}, got ${callbackAmount}`);
      await sql`
        INSERT INTO order_events (order_id, event_type, payload)
        VALUES (${payment.order_id}, 'mpesa_amount_mismatch',
          ${JSON.stringify({ expected: payment.amount_kes, received: callbackAmount })}::jsonb)
      `;
      return ack();
    }

    const [settled] = await sql`
      UPDATE mpesa_payments
      SET status = 'SUCCESS', mpesa_receipt = ${receipt ?? null},
          raw_callback = ${JSON.stringify(body)}::jsonb, completed_at = ${now}
      WHERE id = ${payment.id} AND status = 'PENDING'
      RETURNING id
    `;
    if (!settled) { console.warn("[mpesa/callback] Race: already settled"); return ack(); }

    await sql`UPDATE orders SET status = 'paid' WHERE id = ${payment.order_id}`;
    await sql`
      INSERT INTO order_events (order_id, event_type, payload)
      VALUES (${payment.order_id}, 'mpesa_success',
        ${JSON.stringify({ receipt, checkoutRequestId: cb.CheckoutRequestID })}::jsonb)
    `;
    console.log("[mpesa/callback] SUCCESS — receipt:", receipt);
  } else {
    await sql`
      UPDATE mpesa_payments
      SET status = ${status}, failure_reason = ${cb.ResultDesc ?? null},
          result_code = ${cb.ResultCode}, raw_callback = ${JSON.stringify(body)}::jsonb,
          completed_at = ${now}
      WHERE id = ${payment.id} AND status = 'PENDING'
    `;
    await sql`
      INSERT INTO order_events (order_id, event_type, payload)
      VALUES (${payment.order_id}, 'mpesa_failed',
        ${JSON.stringify({ status, resultCode: cb.ResultCode, resultDesc: cb.ResultDesc })}::jsonb)
    `;
    console.warn("[mpesa/callback]", status, "— code:", cb.ResultCode);
  }

  return ack();
}

// ---------------------------------------------------------------------------

async function status(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { checkoutRequestId } = req.query;
  if (!checkoutRequestId || typeof checkoutRequestId !== "string")
    return res.status(400).json({ error: "checkoutRequestId query param is required" });
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
    status:        payment.status,
    receipt:       payment.mpesa_receipt ?? null,
    failureReason: payment.failure_reason ?? null,
    amountKes:     payment.amount_kes,
    completedAt:   payment.completed_at ?? null,
    orderId:       payment.order_id,
    customerName:  payment.customer_name,
    totalKes:      payment.total_kes,
  });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const action = req.query.action as string | undefined;

  switch (action) {
    case "initiate": return initiate(req, res);
    case "callback": return callback(req, res);
    case "status":   return status(req, res);
    default:
      return res.status(400).json({ error: `Unknown action: "${action}". Use initiate | callback | status.` });
  }
}
