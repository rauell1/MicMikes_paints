import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";

// ---------------------------------------------------------------------------
// Daraja ResultCode → internal status
// ---------------------------------------------------------------------------
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
// Handler — Safaricom posts here; MUST respond with 200 within 5 seconds
// ---------------------------------------------------------------------------
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Daraja only sends POST; ignore everything else silently (don't 405 — it confuses Safaricom)
  if (req.method !== "POST") return res.status(200).end();

  // Always ACK immediately — Safaricom requires 200 within 5s or it retries
  const ack = () =>
    res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });

  if (!process.env.DATABASE_URL) {
    console.error("[mpesa/callback] DATABASE_URL not set");
    return ack();
  }

  const body = req.body as {
    Body?: {
      stkCallback?: {
        MerchantRequestID?: string;
        CheckoutRequestID?: string;
        ResultCode?: number;
        ResultDesc?: string;
        CallbackMetadata?: {
          Item?: Array<{ Name: string; Value?: string | number }>;
        };
      };
    };
  };

  const cb = body?.Body?.stkCallback;

  if (
    !cb?.CheckoutRequestID ||
    !cb?.MerchantRequestID ||
    cb?.ResultCode === undefined
  ) {
    console.error("[mpesa/callback] Malformed callback body:", JSON.stringify(body));
    return ack();
  }

  console.log("[mpesa/callback]", {
    checkoutRequestId: cb.CheckoutRequestID,
    resultCode: cb.ResultCode,
    resultDesc: cb.ResultDesc,
  });

  const sql = neon(process.env.DATABASE_URL!);

  // Look up the pending payment
  const [payment] = await sql`
    SELECT id, order_id, amount_kes, status
    FROM mpesa_payments
    WHERE checkout_request_id = ${cb.CheckoutRequestID}
  `;

  if (!payment) {
    console.warn("[mpesa/callback] Unknown CheckoutRequestID:", cb.CheckoutRequestID);
    return ack();
  }

  // Deduplication — already settled
  if (payment.status !== "PENDING") {
    console.warn("[mpesa/callback] Duplicate callback — already", payment.status);
    return ack();
  }

  const status = resultCodeToStatus(cb.ResultCode);
  const now    = new Date().toISOString();

  if (cb.ResultCode === 0) {
    // --- SUCCESS ---
    const items = cb.CallbackMetadata?.Item ?? [];
    const get   = (name: string) => items.find((i) => i.Name === name)?.Value;

    const receipt         = get("MpesaReceiptNumber") as string | undefined;
    const callbackAmount  = get("Amount") as number | undefined;

    // Amount sanity check (±1 KES tolerance)
    if (callbackAmount !== undefined && Math.abs(callbackAmount - payment.amount_kes) > 1) {
      console.error(
        `[mpesa/callback] Amount mismatch: expected ${payment.amount_kes}, got ${callbackAmount}`
      );
      // Don't settle — flag for manual review
      await sql`
        INSERT INTO order_events (order_id, event_type, payload)
        VALUES (${payment.order_id}, 'mpesa_amount_mismatch',
          ${JSON.stringify({ expected: payment.amount_kes, received: callbackAmount, checkoutRequestId: cb.CheckoutRequestID })}::jsonb)
      `;
      return ack();
    }

    // Atomic settle — only if still PENDING
    const [settled] = await sql`
      UPDATE mpesa_payments
      SET status = 'SUCCESS',
          mpesa_receipt  = ${receipt ?? null},
          raw_callback   = ${JSON.stringify(body)}::jsonb,
          completed_at   = ${now}
      WHERE id = ${payment.id} AND status = 'PENDING'
      RETURNING id
    `;

    if (!settled) {
      console.warn("[mpesa/callback] Race: payment already settled");
      return ack();
    }

    // Mark order as paid
    await sql`
      UPDATE orders SET status = 'paid' WHERE id = ${payment.order_id}
    `;

    await sql`
      INSERT INTO order_events (order_id, event_type, payload)
      VALUES (${payment.order_id}, 'mpesa_success',
        ${JSON.stringify({ receipt, checkoutRequestId: cb.CheckoutRequestID })}::jsonb)
    `;

    console.log("[mpesa/callback] Payment SUCCESS — receipt:", receipt);
  } else {
    // --- FAILURE / CANCELLATION ---
    await sql`
      UPDATE mpesa_payments
      SET status         = ${status},
          failure_reason = ${cb.ResultDesc ?? null},
          result_code    = ${cb.ResultCode},
          raw_callback   = ${JSON.stringify(body)}::jsonb,
          completed_at   = ${now}
      WHERE id = ${payment.id} AND status = 'PENDING'
    `;

    await sql`
      INSERT INTO order_events (order_id, event_type, payload)
      VALUES (${payment.order_id}, 'mpesa_failed',
        ${JSON.stringify({ status, resultCode: cb.ResultCode, resultDesc: cb.ResultDesc })}::jsonb)
    `;

    console.warn("[mpesa/callback] Payment", status, "— code:", cb.ResultCode);
  }

  return ack();
}
