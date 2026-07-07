import { db } from "../db/client";
import { orders, orderItems, orderStatusHistory } from "../db/schema/commerce";
import { inventoryItems, productVariants, products } from "../db/schema/catalog";
import { auditLogs } from "../db/schema/iam";
import { eq, and, sql } from "drizzle-orm";

export class OrderService {
  /**
   * Create a new order from checkout details.
   */
  static async createOrder(data: {
    customerId?: string;
    vendorId: string;
    subtotalMinor: number;
    discountMinor: number;
    shippingMinor: number;
    taxMinor: number;
    totalMinor: number;
    billingAddressId?: string;
    shippingAddressId?: string;
    notes?: string;
    items: {
      variantId: string;
      productName: string;
      shadeName?: string;
      finishName?: string;
      packSizeMl?: number;
      vendorSku?: string;
      quantity: number;
      unitPriceMinor: number;
      taxMinor: number;
    }[];
  }) {
    const orderId = crypto.randomUUID();
    // Generate order number MMK-YYYYMMDD-XXXX
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const rand = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `MMK-${dateStr}-${rand}`;

    return await db.transaction(async (tx) => {
      // 1. Insert order
      const [order] = await tx
        .insert(orders)
        .values({
          id: orderId,
          orderNumber,
          customerId: data.customerId || null,
          vendorId: data.vendorId,
          status: "pending_payment",
          currencyCode: "KES",
          subtotalMinor: data.subtotalMinor,
          discountMinor: data.discountMinor,
          shippingMinor: data.shippingMinor,
          taxMinor: data.taxMinor,
          totalMinor: data.totalMinor,
          paymentStatus: "unpaid",
          fulfillmentStatus: "unfulfilled",
          billingAddressId: data.billingAddressId || null,
          shippingAddressId: data.shippingAddressId || null,
          notes: data.notes || null,
        })
        .returning();

      // 2. Insert items and reserve stock
      for (const item of data.items) {
        const itemId = crypto.randomUUID();
        await tx.insert(orderItems).values({
          id: itemId,
          orderId,
          variantId: item.variantId,
          productName: item.productName,
          shadeName: item.shadeName || null,
          finishName: item.finishName || null,
          packSizeMl: item.packSizeMl || null,
          vendorSku: item.vendorSku || null,
          quantity: item.quantity,
          unitPriceMinor: item.unitPriceMinor,
          lineDiscountMinor: 0,
          taxMinor: item.taxMinor,
          lineTotalMinor: item.quantity * item.unitPriceMinor + item.taxMinor,
        });

        // Reserve stock: reserved_qty += quantity
        await tx
          .update(inventoryItems)
          .set({
            reservedQty: sql`${inventoryItems.reservedQty} + ${item.quantity}`,
          })
          .where(eq(inventoryItems.variantId, item.variantId));
      }

      // 3. Log initial status history
      await tx.insert(orderStatusHistory).values({
        orderId,
        fromStatus: null,
        toStatus: "pending_payment",
        changedByType: "customer",
        changedById: data.customerId || null,
        notes: "Order placed, awaiting payment",
      });

      // 4. Write audit log
      await tx.insert(auditLogs).values({
        actorType: data.customerId ? "customer" : "system",
        actorId: data.customerId || null,
        action: "create_order",
        entityType: "order",
        entityId: orderId,
        metadata: { orderNumber },
      });

      return order;
    });
  }

  /**
   * Update order status and manage inventory levels (reserved vs on-hand).
   */
  static async updateOrderStatus(
    orderId: string,
    newStatus: "pending_payment" | "paid" | "confirmed" | "packed" | "out_for_delivery" | "delivered" | "cancelled" | "refunded",
    actorType: "staff" | "system" | "vendor" | "customer",
    actorId?: string,
    notes?: string
  ) {
    return await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      if (!order) throw new Error("Order not found");

      const oldStatus = order.status;
      if (oldStatus === newStatus) return order;

      // Fetch order items to manage inventory changes
      const items = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));

      // Update order status and corresponding payment status if paid/refunded
      let paymentStatus = order.paymentStatus;
      if (newStatus === "paid" || newStatus === "confirmed") {
        paymentStatus = "paid";
      } else if (newStatus === "cancelled") {
        paymentStatus = "failed";
      } else if (newStatus === "refunded") {
        paymentStatus = "refunded";
      }

      const [updatedOrder] = await tx
        .update(orders)
        .set({
          status: newStatus,
          paymentStatus,
          fulfillmentStatus: newStatus === "delivered" ? "fulfilled" : order.fulfillmentStatus,
        })
        .where(eq(orders.id, orderId))
        .returning();

      // Manage Stock Transitions
      if (newStatus === "cancelled" || newStatus === "refunded") {
        // Release reservation: reserved_qty -= quantity
        for (const item of items) {
          if (item.variantId) {
            await tx
              .update(inventoryItems)
              .set({
                reservedQty: sql`GREATEST(0, ${inventoryItems.reservedQty} - ${item.quantity})`,
              })
              .where(eq(inventoryItems.variantId, item.variantId));
          }
        }
      } else if (newStatus === "delivered") {
        // Complete sale: deduct on_hand_qty & reserved_qty
        for (const item of items) {
          if (item.variantId) {
            await tx
              .update(inventoryItems)
              .set({
                onHandQty: sql`GREATEST(0, ${inventoryItems.onHandQty} - ${item.quantity})`,
                reservedQty: sql`GREATEST(0, ${inventoryItems.reservedQty} - ${item.quantity})`,
              })
              .where(eq(inventoryItems.variantId, item.variantId));
          }
        }
      }

      // Log status transition history
      await tx.insert(orderStatusHistory).values({
        orderId,
        fromStatus: oldStatus,
        toStatus: newStatus,
        changedByType: actorType,
        changedById: actorId || null,
        notes: notes || `Status updated from ${oldStatus} to ${newStatus}`,
      });

      // Write audit log
      await tx.insert(auditLogs).values({
        actorType,
        actorId: actorId || null,
        action: "update_order_status",
        entityType: "order",
        entityId: orderId,
        metadata: { fromStatus: oldStatus, toStatus: newStatus, notes },
      });

      return updatedOrder;
    });
  }
}
