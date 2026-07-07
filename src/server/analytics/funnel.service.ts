import { db } from "../db/client";
import { events, funnelSnapshots } from "../db/schema/analytics";
import { and, gte, lte, eq, sql } from "drizzle-orm";

export class FunnelService {
  /**
   * Aggregate user events into funnel metrics and save performance snapshots.
   */
  static async computeFunnelSnapshot(startDate: Date, endDate: Date) {
    try {
      const startStr = startDate.toISOString().slice(0, 10);
      const endStr = endDate.toISOString().slice(0, 10);

      // 1. Fetch count of sessions that reached each stage
      const getStageSessionCount = async (eventName: string): Promise<number> => {
        const [res] = await db
          .select({ count: sql<string>`COUNT(DISTINCT session_id)` })
          .from(events)
          .where(
            and(
              eq(events.eventName, eventName),
              gte(events.eventTs, startDate),
              lte(events.eventTs, endDate)
            )
          );
        return parseInt(res?.count ?? "0", 10);
      };

      const sessionsViewedHome = await getStageSessionCount("view_home");
      const sessionsAddedCart = await getStageSessionCount("add_to_cart");
      const sessionsCheckedOut = await getStageSessionCount("initiate_checkout");
      const sessionsPlacedOrder = await getStageSessionCount("place_order");

      // 2. Save snapshots for each phase in analytics.funnel_snapshots
      const saveStage = async (stage: string, count: number, total: number) => {
        const rate = total > 0 ? (count / total).toFixed(4) : "0.0000";
        await db.insert(funnelSnapshots).values({
          periodStart: startStr,
          periodEnd: endStr,
          funnelStage: stage,
          visitorCount: count,
          conversionRate: rate,
        });
      };

      await saveStage("home_view", sessionsViewedHome, sessionsViewedHome || 1);
      await saveStage("cart_addition", sessionsAddedCart, sessionsViewedHome || 1);
      await saveStage("checkout_start", sessionsCheckedOut, sessionsAddedCart || 1);
      await saveStage("order_completion", sessionsPlacedOrder, sessionsCheckedOut || 1);

      return {
        viewedHome: sessionsViewedHome,
        addedCart: sessionsAddedCart,
        checkedOut: sessionsCheckedOut,
        placedOrder: sessionsPlacedOrder,
      };
    } catch (err) {
      console.error("[FunnelService] Failed to compute funnel snapshot:", err);
      throw err;
    }
  }
}
