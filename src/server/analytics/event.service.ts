import { db } from "../db/client";
import { events } from "../db/schema/analytics";

export class EventService {
  /**
   * Track an analytics event asynchronously (fire-and-forget).
   */
  static async trackEvent(
    eventName: string,
    data: {
      customerId?: string;
      sessionId?: string;
      pagePath?: string;
      entityType?: string;
      entityId?: string;
      properties?: Record<string, any>;
    }
  ) {
    // Fire-and-forget: do not await this insert in critical path, execute in background
    db.insert(events)
      .values({
        customerId: data.customerId || null,
        sessionId: data.sessionId || null,
        eventName,
        pagePath: data.pagePath || null,
        entityType: data.entityType || null,
        entityId: data.entityId || null,
        properties: data.properties || {},
      })
      .catch((err) => {
        console.error(`[EventService] Event logging failed for "${eventName}":`, err);
      });
  }
}
