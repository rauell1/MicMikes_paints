import { db } from "../db/client";
import { webhookEvents } from "../db/schema/integration";
import { eq } from "drizzle-orm";

export class WebhookInboxService {
  /**
   * Process incoming external webhooks idempotently using unique keys.
   */
  static async receiveWebhook(data: {
    sourceSystem: string;
    eventType: string;
    idempotencyKey: string;
    payload: Record<string, any>;
  }) {
    try {
      return await db.transaction(async (tx) => {
        // 1. Check for existing webhook event with the same idempotency key
        const [existing] = await tx
          .select()
          .from(webhookEvents)
          .where(eq(webhookEvents.idempotencyKey, data.idempotencyKey))
          .limit(1);

        if (existing) {
          console.warn(`[WebhookInbox] Skipping duplicate webhook for key: ${data.idempotencyKey}`);
          return existing;
        }

        const eventId = crypto.randomUUID();

        // 2. Insert as pending/processing to lock the request
        const [event] = await tx
          .insert(webhookEvents)
          .values({
            id: eventId,
            sourceSystem: data.sourceSystem,
            eventType: data.eventType,
            idempotencyKey: data.idempotencyKey,
            payload: data.payload,
            status: "processing",
          })
          .returning();

        try {
          // 3. Process the event payload based on type
          console.log(`[WebhookInbox] Processing event "${data.eventType}" from "${data.sourceSystem}"...`);
          
          // Delegate custom business operations depending on eventType:
          // e.g. "mpesa.payment.completed", "carrier.shipment.delivered"

          // 4. Mark as successfully processed
          const [processedEvent] = await tx
            .update(webhookEvents)
            .set({
              status: "processed",
              processedAt: new Date(),
            })
            .where(eq(webhookEvents.id, eventId))
            .returning();

          return processedEvent;
        } catch (err: any) {
          console.error(`[WebhookInbox] Failed to process payload for key: ${data.idempotencyKey}`, err);
          
          const [failedEvent] = await tx
            .update(webhookEvents)
            .set({
              status: "failed",
              errorMessage: err.message || "Execution failed",
            })
            .where(eq(webhookEvents.id, eventId))
            .returning();

          return failedEvent;
        }
      });
    } catch (err) {
      console.error("[WebhookInbox] receiveWebhook failed:", err);
      throw err;
    }
  }
}
