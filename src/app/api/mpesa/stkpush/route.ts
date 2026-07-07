import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { sql } from "drizzle-orm";

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
    headers: { Authorization: `Basic ${credentials}` }
  });
  if (!res.ok) throw new Error(`M-Pesa OAuth failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const checkoutRequestId = searchParams.get("id");

  if (!checkoutRequestId) {
    return NextResponse.json({ error: "id (checkoutRequestId) is required" }, { status: 400 });
  }

  try {
    const payments = (await db.execute(sql`
      SELECT pa.status, pa.provider_reference AS mpesa_receipt,
             pa.failure_reason AS failure_reason,
             pa.raw_response->>'resultCode' AS result_code,
             pa.amount_minor / 100 AS amount_kes,
             pa.updated_at AS completed_at,
             o.id AS order_id, 
             addr.recipient_name AS customer_name, 
             o.total_minor / 100 AS total_kes
      FROM payment.payment_attempts pa
      JOIN commerce.orders o ON o.id = pa.order_id
      LEFT JOIN customer.addresses addr ON addr.id = o.shipping_address_id
      WHERE pa.provider_request_id = ${checkoutRequestId}
      LIMIT 1
    `)).rows;

    if (payments.length === 0) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const payment = payments[0];
    return NextResponse.json({
      status: String(payment.status).toLowerCase(),
      receipt: payment.mpesa_receipt ?? null,
      failureReason: payment.failure_reason ?? null,
      amountKes: Number(payment.amount_kes),
      completedAt: payment.completed_at ?? null,
      orderId: payment.order_id,
      customerName: payment.customer_name,
      totalKes: Number(payment.total_kes),
    });
  } catch (err) {
    console.error("[api/mpesa/status] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const required = ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_SHORTCODE", "MPESA_PASSKEY"];
  for (const key of required) {
    if (!process.env[key]) {
      console.error(`[mpesa/stkpush] Missing env var: ${key}`);
      return NextResponse.json({ error: "Payment service not configured" }, { status: 503 });
    }
  }

  try {
    const { orderId, phone, amountKes } = await req.json();
    if (!orderId || !phone || !amountKes) {
      return NextResponse.json({ error: "orderId, phone and amountKes are required" }, { status: 400 });
    }

    const amount = Math.round(amountKes);
    const amountMinor = amount * 100;
    if (amount <= 0) {
      return NextResponse.json({ error: "amountKes must be a positive number" }, { status: 400 });
    }

    let normalisedPhone: string;
    try { normalisedPhone = normalisePhone(String(phone)); }
    catch (err: any) { return NextResponse.json({ error: err.message }, { status: 400 }); }

    // Fetch order + how much has already been paid (sum of successful
    // attempts). Partial payments are allowed: a caller may pay any amount up
    // to the outstanding balance, and the order is only completed once the
    // successful attempts sum to the total (handled in the callback).
    const orders = (await db.execute(sql`
      SELECT o.total_minor,
             COALESCE((
               SELECT SUM(pa.amount_minor) FROM payment.payment_attempts pa
               WHERE pa.order_id = o.id AND pa.status = 'success'
             ), 0) AS paid_minor
      FROM commerce.orders o WHERE o.id = ${orderId} LIMIT 1
    `)).rows;

    if (orders.length === 0) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    const totalMinor = Number(orders[0].total_minor);
    const paidMinor = Number(orders[0].paid_minor);
    const remainingMinor = totalMinor - paidMinor;
    if (remainingMinor <= 0) {
      return NextResponse.json({ error: "This order is already fully paid." }, { status: 400 });
    }
    if (amountMinor > remainingMinor) {
      return NextResponse.json({ error: `Amount exceeds the outstanding balance of KES ${remainingMinor / 100}.` }, { status: 400 });
    }

    const isProd = process.env.MPESA_ENVIRONMENT === "production";
    const base = isProd ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
    const shortCode = process.env.MPESA_SHORTCODE!;
    const passKey   = process.env.MPESA_PASSKEY!;
    const timestamp = getEATTimestamp();
    const password  = generatePassword(shortCode, passKey, timestamp);

    const callbackUrl = process.env.MPESA_CALLBACK_URL;
    if (!callbackUrl && !isProd) {
      console.error("[mpesa/stkpush] MPESA_CALLBACK_URL must be set in non-production environments");
      return NextResponse.json({ error: "Payment service not configured (missing callback URL)" }, { status: 503 });
    }
    const resolvedCallbackUrl = callbackUrl ?? "https://mic-mikes-paints.vercel.app/api/mpesa/callback";

    let accessToken: string;
    try { accessToken = await fetchAccessToken(); }
    catch (err) {
      console.error("[mpesa/stkpush] OAuth error:", err);
      return NextResponse.json({ error: "Could not reach M-Pesa. Please try again." }, { status: 502 });
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

    const stkRes = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(stkBody)
    });

    const stkData = (await stkRes.json()) as any;

    if (!stkRes.ok || stkData.errorCode) {
      console.error("[mpesa/stkpush] STK Push rejected:", stkData);
      return NextResponse.json({ error: stkData.errorMessage ?? "STK Push failed. Please try again." }, { status: 502 });
    }
    if (stkData.ResponseCode !== "0") {
      console.error("[mpesa/stkpush] Non-zero ResponseCode:", stkData);
      return NextResponse.json({ error: stkData.ResponseDescription ?? "STK Push rejected" }, { status: 502 });
    }

    // Insert payment attempt record. Note: there is no `provider` column on
    // payment.payment_attempts; the ON CONFLICT relies on the unique index
    // payment_attempts_provider_request_id_key (migration 006).
    await db.execute(sql`
      INSERT INTO payment.payment_attempts
        (id, order_id, payment_method_id, amount_minor, currency_code, phone_e164, status, provider_request_id, provider_reference)
      VALUES
        (gen_random_uuid(), ${orderId},
         (SELECT id FROM payment.payment_methods WHERE code = 'MPESA_STK' LIMIT 1),
         ${amountMinor}, 'KES', ${normalisedPhone}, 'initiated', ${stkData.CheckoutRequestID}, ${stkData.MerchantRequestID})
      ON CONFLICT (provider_request_id) DO NOTHING
    `);

    // Insert status history
    await db.execute(sql`
      INSERT INTO commerce.order_status_history (order_id, from_status, to_status, changed_by_type, notes)
      VALUES (${orderId}, 'pending_payment', 'pending_payment', 'system', 'M-Pesa STK push initiated')
    `);

    return NextResponse.json({
      checkoutRequestId: stkData.CheckoutRequestID,
      customerMessage:   stkData.CustomerMessage ?? "Please check your phone and enter your M-Pesa PIN.",
    });

  } catch (err) {
    console.error("[api/mpesa/stkpush] Unexpected error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
