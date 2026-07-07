import { db } from "../db/client";
import { paymentAttempts, paymentMethods, refunds } from "../db/schema/payment";
import { OrderService } from "../commerce/order.service";
import { orders } from "../db/schema/commerce";
import { eq, and } from "drizzle-orm";

export class PaymentService {
  /**
   * Register a new payment attempt for an order.
   */
  static async createPaymentAttempt(data: {
    orderId: string;
    phoneE164: string;
    amountMinor: number;
    methodCode: string;
    providerRequestId?: string;
    rawRequest?: any;
  }) {
    try {
      // Find payment method by code
      const [method] = await db
        .select()
        .from(paymentMethods)
        .where(eq(paymentMethods.code, data.methodCode))
        .limit(1);

      if (!method) throw new Error(`Payment method ${data.methodCode} not found`);

      const attemptId = crypto.randomUUID();
      const [attempt] = await db
        .insert(paymentAttempts)
        .values({
          id: attemptId,
          orderId: data.orderId,
          paymentMethodId: method.id,
          providerRequestId: data.providerRequestId || null,
          amountMinor: data.amountMinor,
          currencyCode: "KES",
          phoneE164: data.phoneE164,
          status: "initiated",
          rawRequest: data.rawRequest || {},
        })
        .returning();

      return attempt;
    } catch (err) {
      console.error("[PaymentService] Failed to create payment attempt:", err);
      throw err;
    }
  }

  /**
   * Resolve checkout callback from provider and transition order states.
   */
  static async resolvePaymentAttempt(
    checkoutRequestId: string,
    isSuccess: boolean,
    details: {
      providerReference?: string;
      failureReason?: string;
      rawResponse?: any;
    }
  ) {
    try {
      return await db.transaction(async (tx) => {
        // Find payment attempt
        const [attempt] = await tx
          .select()
          .from(paymentAttempts)
          .where(eq(paymentAttempts.providerRequestId, checkoutRequestId))
          .limit(1);

        if (!attempt) {
          console.warn(`[PaymentService] Attempt with checkoutRequestId ${checkoutRequestId} not found`);
          return null;
        }

        const newStatus = isSuccess ? "success" : "failed";
        
        // Update attempt
        const [updatedAttempt] = await tx
          .update(paymentAttempts)
          .set({
            status: newStatus,
            providerReference: details.providerReference || attempt.providerReference,
            failureReason: details.failureReason || null,
            rawResponse: details.rawResponse || {},
            updatedAt: new Date(),
          })
          .where(eq(paymentAttempts.id, attempt.id))
          .returning();

        // If successful, transition order status to 'paid'
        if (isSuccess) {
          await OrderService.updateOrderStatus(
            attempt.orderId,
            "paid",
            "system",
            undefined,
            `Payment completed via checkout reference: ${details.providerReference || "N/A"}`
          );
        } else {
          await OrderService.updateOrderStatus(
            attempt.orderId,
            "cancelled",
            "system",
            undefined,
            `Payment failed: ${details.failureReason || "Transaction failed"}`
          );
        }

        return updatedAttempt;
      });
    } catch (err) {
      console.error(`[PaymentService] Failed to resolve payment attempt for requestId ${checkoutRequestId}:`, err);
      throw err;
    }
  }

  /**
   * Log order refund transaction.
   */
  static async refundPayment(data: {
    orderId: string;
    amountMinor: number;
    reason: string;
    staffUserId: string;
  }) {
    try {
      return await db.transaction(async (tx) => {
        const [order] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, data.orderId))
          .limit(1);

        if (!order) throw new Error("Order not found");

        const refundId = crypto.randomUUID();
        const [refund] = await tx
          .insert(refunds)
          .values({
            id: refundId,
            orderId: data.orderId,
            amountMinor: data.amountMinor,
            reason: data.reason,
            status: "succeeded",
            initiatedByType: "staff",
            initiatedById: data.staffUserId,
          })
          .returning();

        // Transition order status to 'refunded'
        await OrderService.updateOrderStatus(
          data.orderId,
          "refunded",
          "staff",
          data.staffUserId,
          `Refund processed: ${data.reason}`
        );

        return refund;
      });
    } catch (err) {
      console.error("[PaymentService] Failed to process refund:", err);
      throw err;
    }
  }
}
