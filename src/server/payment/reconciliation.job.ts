import { db } from "../db/client";
import { paymentAttempts } from "../db/schema/payment";
import { MpesaProvider } from "./providers/mpesa.provider";
import { PaymentService } from "./payment.service";
import { eq, and, gte, lte } from "drizzle-orm";

export class PaymentReconciliationJob {
  /**
   * Scan and settle stuck payment attempts.
   */
  static async reconcilePendingPayments() {
    try {
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Fetch payment attempts stuck in initiated/pending states
      const pendingAttempts = await db
        .select()
        .from(paymentAttempts)
        .where(
          and(
            eq(paymentAttempts.status, "initiated"),
            gte(paymentAttempts.createdAt, oneDayAgo),
            lte(paymentAttempts.createdAt, oneMinuteAgo)
          )
        );

      if (pendingAttempts.length === 0) return { reconciled: 0 };

      console.log(`[ReconciliationJob] Found ${pendingAttempts.length} pending payments to check.`);

      let reconciled = 0;
      for (const attempt of pendingAttempts) {
        if (!attempt.providerRequestId) continue;

        try {
          const statusRes = await MpesaProvider.queryTransactionStatus(attempt.providerRequestId);

          // Daraja Query Response Codes:
          // "0" = Success
          // "1032" = Cancelled by user
          // "1037" = Timeout
          if (statusRes.ResultCode === "0") {
            console.log(`[ReconciliationJob] Payment attempt ${attempt.id} verified as SUCCESS.`);
            await PaymentService.resolvePaymentAttempt(attempt.providerRequestId, true, {
              providerReference: statusRes.mpesaReceiptNumber || "RECONCILED",
              rawResponse: statusRes,
            });
            reconciled++;
          } else if (statusRes.ResultCode) {
            console.log(`[ReconciliationJob] Payment attempt ${attempt.id} verified as FAILED (${statusRes.ResultCode}).`);
            await PaymentService.resolvePaymentAttempt(attempt.providerRequestId, false, {
              failureReason: statusRes.ResultDesc || `Status code: ${statusRes.ResultCode}`,
              rawResponse: statusRes,
            });
            reconciled++;
          }
        } catch (err) {
          console.error(`[ReconciliationJob] Failed to query status for attempt ${attempt.id}:`, err);
        }
      }

      return { reconciled };
    } catch (err) {
      console.error("[ReconciliationJob] Job execution failed:", err);
      throw err;
    }
  }
}
