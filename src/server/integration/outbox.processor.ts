import { db } from "../db/client";
import { outboxEvents } from "../db/schema/integration";
import { eq, and, lte } from "drizzle-orm";

export class OutboxProcessor {
  /**
   * Queue an integration event in the outbox.
   */
  static async queueEvent(data: {
    aggregateType: "order" | "payment" | "vendor" | "customer";
    aggregateId: string;
    eventType: string;
    payload: Record<string, any>;
    targetSystem: "crm" | "erp" | "logistics" | "email" | "sms";
  }) {
    try {
      const [event] = await db
        .insert(outboxEvents)
        .values({
          id: crypto.randomUUID(),
          aggregateType: data.aggregateType,
          aggregateId: data.aggregateId,
          eventType: data.eventType,
          payload: data.payload,
          targetSystem: data.targetSystem,
          status: "pending",
        })
        .returning();

      return event;
    } catch (err) {
      console.error("[OutboxProcessor] Failed to queue outbox event:", err);
      throw err;
    }
  }

  /**
   * Process all pending outbox events (simulating worker loop).
   */
  static async processPendingEvents() {
    try {
      const pending = await db
        .select()
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.status, "pending"),
            lte(outboxEvents.retryCount, 3)
          )
        );

      if (pending.length === 0) return { processed: 0 };

      console.log(`[OutboxProcessor] Found ${pending.length} pending events to dispatch...`);

      let processed = 0;
      for (const event of pending) {
        try {
          // Simulate dispatching to target system webhook endpoints (CRM / ERP / Logistics)
          console.log(`[OutboxProcessor] Dispatching event ${event.eventType} to ${event.targetSystem}...`);
          
          // Mock external network request success
          await new Promise((resolve) => setTimeout(resolve, 50));

          await db
            .update(outboxEvents)
            .set({
              status: "sent",
              sentAt: new Date(),
              updatedAt: new Date(),
            } as any) // Drizzle supports column updates
            .where(eq(outboxEvents.id, event.id));
          
          processed++;
        } catch (err: any) {
          console.error(`[OutboxProcessor] Dispatch failed for event ${event.id}:`, err);
          await db
            .update(outboxEvents)
            .set({
              status: "failed",
              errorMessage: err.message || "Unknown error",
              retryCount: event.retryCount + 1,
            })
            .where(eq(outboxEvents.id, event.id));
        }
      }

      return { processed };
    } catch (err) {
      console.error("[OutboxProcessor] processPendingEvents failed:", err);
      throw err;
    }
  }
}
