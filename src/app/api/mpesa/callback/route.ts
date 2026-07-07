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

// Map Safaricom result codes to a value allowed by the
// payment_attempts_status_check constraint: initiated | pending | success |
// failed | cancelled | expired. The human-readable detail (insufficient
// funds, wrong PIN, etc.) is preserved separately in failure_reason.
function resultCodeToStatus(code: number): "success" | "cancelled" | "expired" | "failed" {
  switch (code) {
    case 0:    return "success";
    case 1032: return "cancelled";        // user cancelled
    case 1037: return "expired";          // no response / DS timeout
    case 1001: return "expired";          // unable to lock subscriber / timeout
    case 1019: return "expired";          // transaction expired
    default:   return "failed";           // 1 insufficient, 17 limit, 1006 wrong PIN, 1025 sys error, etc.
  }
}

// Short reason string for failure_reason, keyed off the result code.
function resultCodeReason(code: number, desc?: string): string {
  const known: Record<number, string> = {
    1032: "Cancelled by user",
    1037: "Timed out - no response",
    1001: "Timed out - could not reach subscriber",
    1019: "Transaction expired",
    1:    "Insufficient funds",
    17:   "M-Pesa daily limit exceeded",
    1006: "Wrong M-Pesa PIN",
    1025: "Safaricom system error",
  };
  return known[code] ?? desc ?? `Payment failed (code ${code})`;
}

export async function POST(req: NextRequest) {
  const ack = () => NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });

  /* ── IP validation: only accept callbacks from Safaricom ──
     Gate on the M-Pesa environment, not NODE_ENV: on Vercel NODE_ENV is
     "production" for preview deploys too, so keying off it would enforce the
     allow-list during sandbox testing. ── */
  if (process.env.MPESA_ENVIRONMENT === "production") {
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

    const rawResponse = JSON.stringify({
      resultCode: cb.ResultCode,
      resultDesc: cb.ResultDesc,
      rawCallback: body,
    });

    // Decide success vs failure. A success whose reported amount does not
    // match the initiated amount (>1 KES) is downgraded to a failure rather
    // than silently marking the order paid.
    let success = cb.ResultCode === 0;
    let receipt: string | undefined;
    let reason: string | null = null;

    if (success) {
      const items = cb.CallbackMetadata?.Item ?? [];
      const getVal = (name: string) => items.find((i: any) => i.Name === name)?.Value;
      receipt = getVal("MpesaReceiptNumber") as string | undefined;
      const callbackAmount = getVal("Amount") as number | undefined;
      const callbackAmountMinor = callbackAmount ? Math.round(callbackAmount * 100) : 0;
      if (callbackAmountMinor > 0 && Math.abs(callbackAmountMinor - Number(payment.amount_minor)) > 100) {
        console.error(
          `[mpesa/callback] Amount mismatch: expected ${Number(payment.amount_minor) / 100}, got ${callbackAmount} — rejecting`
        );
        success = false;
        reason = `Amount mismatch: paid ${callbackAmount}, expected ${Number(payment.amount_minor) / 100}`;
      }
    }

    if (success) {
      // Atomic settle: one statement (neon-http has no interactive tx). The
      // guarded UPDATE only fires from initiated/pending, so a duplicate
      // callback settles zero rows and the CTE is a no-op.
      const settled = (await db.execute(sql`
        WITH settled AS (
          UPDATE payment.payment_attempts
          SET status = 'success', provider_reference = ${receipt ?? null},
              failure_reason = NULL, raw_response = ${rawResponse}::jsonb, updated_at = now()
          WHERE id = ${payment.id} AND status IN ('initiated', 'pending')
          RETURNING order_id
        ),
        ord AS (
          UPDATE commerce.orders
          SET status = 'paid', payment_status = 'paid'
          WHERE id IN (SELECT order_id FROM settled)
          RETURNING id
        )
        INSERT INTO commerce.order_status_history (order_id, from_status, to_status, changed_by_type, notes)
        SELECT order_id, 'pending_payment', 'paid', 'system', ${`M-Pesa payment success. Receipt: ${receipt ?? "N/A"}`}
        FROM settled
        RETURNING order_id
      `)).rows;

      if (settled.length === 0) {
        console.warn("[mpesa/callback] Already settled — duplicate callback ignored");
        return ack();
      }
      console.log("[mpesa/callback] SUCCESS - receipt:", receipt, "order:", payment.order_id);
    } else {
      const status = resultCodeToStatus(cb.ResultCode);
      const failureReason = reason ?? resultCodeReason(cb.ResultCode, cb.ResultDesc);
      await db.execute(sql`
        WITH settled AS (
          UPDATE payment.payment_attempts
          SET status = ${status}, failure_reason = ${failureReason},
              raw_response = ${rawResponse}::jsonb, updated_at = now()
          WHERE id = ${payment.id} AND status IN ('initiated', 'pending')
          RETURNING order_id
        )
        INSERT INTO commerce.order_status_history (order_id, from_status, to_status, changed_by_type, notes)
        SELECT order_id, 'pending_payment', 'pending_payment', 'system', ${`M-Pesa ${status}: ${failureReason}`}
        FROM settled
      `);
      console.warn("[mpesa/callback]", status, "- code:", cb.ResultCode, "-", failureReason);
    }

    return ack();
  } catch (err) {
    console.error("[mpesa/callback] Error processing callback:", err);
    return ack();
  }
}
