import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";

function resultCodeToStatus(code: number): string {
  switch (code) {
    case 0:    return "SUCCESS";
    case 1032: return "CANCELLED";
    case 1037: return "TIMEOUT";
    case 1001: return "TIMEOUT";
    case 1019: return "EXPIRED";
    case 1:    return "INSUFFICIENT_FUNDS";
    case 17:   return "LIMIT_EXCEEDED";
    case 1006: return "WRONG_PIN";
    case 1025: return "SAFARICOM_ERROR";
    default:   return "FAILED";
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(200).end();
  const ack = () => res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });

  if (!process.env.DATABASE_URL) {
    console.error("[mpesa/callback] DATABASE_URL not set");
    return ack();
  }

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

  if (!payment) {
    console.warn("[mpesa/callback] Unknown CheckoutRequestID:", cb.CheckoutRequestID);
    return ack();
  }
  if (payment.status !== "PENDING") {
    console.warn("[mpesa/callback] Duplicate — already", payment.status);
    return ack();
  }

  const status = resultCodeToStatus(cb.ResultCode);
  const now = new Date().toISOString();

  if (cb.ResultCode === 0) {
    const items = cb.CallbackMetadata?.Item ?? [];
    const get = (name: string) => items.find((i) => i.Name === name)?.Value;
    const receipt = get("MpesaReceiptNumber") as string | undefined;
    const callbackAmount = get("Amount") as number | undefined;

    if (callbackAmount !== undefined && Math.abs(callbackAmount - payment.amount_kes) > 1) {
      console.warn(
        `[mpesa/callback] Amount mismatch (logged only): expected ${payment.amount_kes}, got ${callbackAmount}`
      );
      await sql`
        INSERT INTO order_events (order_id, event_type, payload)
        VALUES (${payment.order_id}, 'mpesa_amount_mismatch',
          ${JSON.stringify({ expected: payment.amount_kes, received: callbackAmount })}::jsonb)
      `;
    }

    const [settled] = await sql`
      UPDATE mpesa_payments
      SET status = 'SUCCESS', mpesa_receipt = ${receipt ?? null},
          raw_callback = ${JSON.stringify(body)}::jsonb, completed_at = ${now}
      WHERE id = ${payment.id} AND status = 'PENDING'
      RETURNING id
    `;
    if (!settled) { console.warn("[mpesa/callback] Race: already settled"); return ack(); }

    /* ── FIX: write receipt number directly onto the order row ── */
    await sql`
      UPDATE orders
      SET status = 'paid', mpesa_ref = ${receipt ?? null}, updated_at = ${now}
      WHERE id = ${payment.order_id}
    `;

    await sql`
      INSERT INTO order_events (order_id, event_type, payload)
      VALUES (${payment.order_id}, 'mpesa_success',
        ${JSON.stringify({ receipt, callbackAmount, checkoutRequestId: cb.CheckoutRequestID })}::jsonb)
    `;
    console.log("[mpesa/callback] SUCCESS — receipt:", receipt, "order:", payment.order_id);
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
