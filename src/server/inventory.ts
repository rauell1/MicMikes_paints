import { db } from "@/server/db/client";
import { sql } from "drizzle-orm";

/* ─────────────────────────────────────────────────────────────────────────────
   Inventory reservation lifecycle.

   - Order created  → reserved_qty += qty on catalog.inventory_items
                      (see src/app/api/orders/route.ts), and the amount is
                      recorded on commerce.order_items.reserved_qty.
   - Cancelled / abandoned (30-day cleanup) → releaseReservations: the held
     units return to availability (reserved_qty -= qty). on_hand unchanged.
   - Delivered → commitReservations: the goods physically leave stock
     (on_hand_qty -= qty AND reserved_qty -= qty). available is unchanged.

   Both operations zero the order line's reserved_qty so they are idempotent —
   a second call (duplicate webhook, retried admin action) is a no-op. Each is
   a single statement (neon-http has no interactive transactions).
───────────────────────────────────────────────────────────────────────────── */

/** Return an order's reserved units to availability (cancel / abandonment). */
export async function releaseReservations(orderId: string): Promise<void> {
  await db.execute(sql`
    WITH to_release AS (
      SELECT variant_id, SUM(reserved_qty)::int AS qty
      FROM commerce.order_items
      WHERE order_id = ${orderId} AND reserved_qty > 0
      GROUP BY variant_id
    ),
    zeroed AS (
      UPDATE commerce.order_items SET reserved_qty = 0
      WHERE order_id = ${orderId} AND reserved_qty > 0
      RETURNING 1
    )
    UPDATE catalog.inventory_items ii
    SET reserved_qty = GREATEST(0, ii.reserved_qty - t.qty), updated_at = now()
    FROM to_release t
    WHERE ii.variant_id = t.variant_id
  `);
}

/** Commit an order's reserved units as sold/shipped (goods leave on-hand). */
export async function commitReservations(orderId: string): Promise<void> {
  await db.execute(sql`
    WITH to_commit AS (
      SELECT variant_id, SUM(reserved_qty)::int AS qty
      FROM commerce.order_items
      WHERE order_id = ${orderId} AND reserved_qty > 0
      GROUP BY variant_id
    ),
    zeroed AS (
      UPDATE commerce.order_items SET reserved_qty = 0
      WHERE order_id = ${orderId} AND reserved_qty > 0
      RETURNING 1
    )
    UPDATE catalog.inventory_items ii
    SET on_hand_qty   = GREATEST(0, ii.on_hand_qty - t.qty),
        reserved_qty  = GREATEST(0, ii.reserved_qty - t.qty),
        updated_at = now()
    FROM to_commit t
    WHERE ii.variant_id = t.variant_id
  `);
}
