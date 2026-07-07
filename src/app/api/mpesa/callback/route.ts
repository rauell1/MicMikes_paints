import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { sql } from "drizzle-orm";

const SAFARICOM_IPS = new Set([
  "196.201.214.200","196.201.214.201","196.201.214.202","196.201.214.203",
  "196.201.214.204","196.201.214.207","196.201.214.208","196.201.214.209",
  "196.201.214.210","196.201.214.211","196.201.214.212","196.201.214.213",
  "196.201.214.214","196.201.214.215","196.201.214.216","196.201.214.217",
  "196.201.214.218","196.201.214.219","196.201.214.220","196.201.214.221",
  "196.201.214.222","196.201.214.223",
  "196.201.214.206", // Sandbox IP
]);

function getCallerIP(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? "";
}

function resultCodeToStatus(code: number): string {
  switch (code) {
    case 0:    return "success";
    case 1032: return "cancelled";
    case 1037: return "timeout";
    case 1001: return "timeout";
    case 1019: return "expired";
    case 1:    return "insufficient_funds";
    case 17:   return "limit_exceeded";
    case 1006: return "wrong_pin";
    case 1025: return "safaricom_error";
    default:   return "failed";
  }
}

export async function POST(req: NextRequest) {
  const ack = () => NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });

  /* ── IP validation: only accept callbacks from Safaricom ── */
  if (process.env.NODE_ENV === "production") {
    const ip = getCallerIP(req);
    if (ip && !SAFARICOM_IPS.has(ip)) {
      console.warn("[mpesa/callback] Blocked non-Safaricom IP:", ip);
      return ack(); // Silent ack to prevent Safaricom retry storms
    }
  }

  try {
    const body = await req.json();
    const cb = body?.Body?.stkCallback;
    if (!cb?.CheckoutRequestID || !cb?.MerchantRequestID || cb?.ResultCode === undefined) {
      console.error("[mpesa/callback] Malformed body:", JSON.stringify(body));
      return ack();
    }

    const payments = (await db.execute(sql`
      SELECT id, order_id, amount_minor, status FROM payment.payment_attempts
      WHERE provider_request_id = ${cb.CheckoutRequestID}
      LIMIT 1
    `)).rows;

    if (payments.length === 0) {
      console.warn("[mpesa/callback] Unknown CheckoutRequestID:", cb.CheckoutRequestID);
      return ack();
    }

    const payment = payments[0];
    if (payment.status !== "initiated" && payment.status !== "pending") {
      console.warn("[mpesa/callback] Duplicate callback — already", payment.status);
      return ack();
    }

    const status = resultCodeToStatus(cb.ResultCode);
    const payloadJson = JSON.stringify({
      resultCode: cb.ResultCode,
      resultDesc: cb.ResultDesc,
      rawCallback: body,
      errorMessage: cb.ResultCode !== 0 ? cb.ResultDesc : null
    });

    if (cb.ResultCode === 0) {
      const items = cb.CallbackMetadata?.Item ?? [];
      const getVal = (name: string) => items.find((i: any) => i.Name === name)?.Value;
      const receipt = getVal("MpesaReceiptNumber") as string | undefined;
      const callbackAmount = getVal("Amount") as number | undefined;
      const callbackAmountMinor = callbackAmount ? Math.round(callbackAmount * 100) : 0;

      if (callbackAmountMinor > 0 && Math.abs(callbackAmountMinor - Number(payment.amount_minor)) > 100) {
        console.warn(
          `[mpesa/callback] Amount mismatch: expected ${Number(payment.amount_minor)/100}, got ${callbackAmount}`
        );
      }

      // Update payment attempt
      const settled = (await db.execute(sql`
        UPDATE payment.payment_attempts
        SET status = 'success', provider_reference = ${receipt ?? null},
            payload = ${payloadJson}::jsonb, updated_at = now()
        WHERE id = ${payment.id} AND (status = 'initiated' OR status = 'pending')
        RETURNING id
      `)).rows;

      if (settled.length === 0) {
        console.warn("[mpesa/callback] Race condition: already settled");
        return ack();
      }

      // Update order to paid
      await db.execute(sql`
        UPDATE commerce.orders
        SET status = 'paid', payment_status = 'paid', updated_at = now()
        WHERE id = ${payment.order_id}
      `);

      // Record status history
      await db.execute(sql`
        INSERT INTO commerce.order_status_history (order_id, from_status, to_status, changed_by_type, notes)
        VALUES (${payment.order_id}, 'pending_payment', 'paid', 'system', ${`M-Pesa payment success. Receipt: ${receipt ?? 'N/A'}`})
      `);

      console.log("[mpesa/callback] SUCCESS — receipt:", receipt, "order:", payment.order_id);
    } else {
      // Payment failed/cancelled
      await db.execute(sql`
        UPDATE payment.payment_attempts
        SET status = ${status}, payload = ${payloadJson}::jsonb, updated_at = now()
        WHERE id = ${payment.id} AND (status = 'initiated' OR status = 'pending')
      `);

      // Record status history
      await db.execute(sql`
        INSERT INTO commerce.order_status_history (order_id, from_status, to_status, changed_by_type, notes)
        VALUES (${payment.order_id}, 'pending_payment', 'pending_payment', 'system', ${`M-Pesa payment failed/cancelled: ${cb.ResultDesc ?? 'N/A'}`})
      `);

      console.warn("[mpesa/callback]", status, "— code:", cb.ResultCode);
    }

    return ack();
  } catch (err) {
    console.error("[mpesa/callback] Error processing callback:", err);
    return ack();
  }
}
