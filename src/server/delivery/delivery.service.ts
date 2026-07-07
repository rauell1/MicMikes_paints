import { db } from "../db/client";
import { deliveryZones, shipments, shipmentEvents } from "../db/schema/delivery";
import { OrderService } from "../commerce/order.service";
import { eq, and, isNull } from "drizzle-orm";

export class DeliveryService {
  /**
   * Resolve delivery rate for a given county and subcounty.
   */
  static async getDeliveryRate(countyCode: string, subcountyCode?: string): Promise<number> {
    try {
      if (subcountyCode) {
        // Match specific county and subcounty
        const [zone] = await db
          .select()
          .from(deliveryZones)
          .where(
            and(
              eq(deliveryZones.countyCode, countyCode),
              eq(deliveryZones.subcountyCode, subcountyCode),
              eq(deliveryZones.isActive, true)
            )
          )
          .limit(1);

        if (zone) return zone.baseFeeMinor / 100;
      }

      // Match county default rate (where subcounty is null)
      const [defaultZone] = await db
        .select()
        .from(deliveryZones)
        .where(
          and(
            eq(deliveryZones.countyCode, countyCode),
            isNull(deliveryZones.subcountyCode),
            eq(deliveryZones.isActive, true)
          )
        )
        .limit(1);

      if (defaultZone) return defaultZone.baseFeeMinor / 100;

      // Fallback rate if county/town not matched in database
      return 350;
    } catch (err) {
      console.error("[DeliveryService] getDeliveryRate failed:", err);
      return 350;
    }
  }

  /**
   * Initialize a new shipment for an order.
   */
  static async createShipment(orderId: string, carrierName: string) {
    const shipmentId = crypto.randomUUID();
    const trackingNumber = `TRK-${Math.floor(100000 + Math.random() * 900000)}`;

    return await db.transaction(async (tx) => {
      // 1. Create shipment
      const [shipment] = await tx
        .insert(shipments)
        .values({
          id: shipmentId,
          orderId,
          providerType: "third_party",
          providerName: carrierName,
          trackingNumber,
          status: "pending",
        })
        .returning();

      // 2. Add shipment event
      await tx.insert(shipmentEvents).values({
        shipmentId,
        eventType: "pending",
        location: "Warehouse",
        description: "Delivery scheduled, awaiting dispatch.",
      });

      return shipment;
    });
  }

  /**
   * Append a shipment event and transition order status on delivery.
   */
  static async addShipmentEvent(
    shipmentId: string,
    status: "pending" | "scheduled" | "picked" | "in_transit" | "delivered" | "failed" | "returned",
    location: string,
    description: string
  ) {
    return await db.transaction(async (tx) => {
      // 1. Insert shipment event
      await tx.insert(shipmentEvents).values({
        shipmentId,
        eventType: status,
        location,
        description,
      });

      // 2. Update shipment status and dates
      const updateData: Partial<typeof shipments.$inferInsert> = { status };
      if (status === "delivered") {
        updateData.deliveredAt = new Date();
      }

      const [shipment] = await tx
        .update(shipments)
        .set(updateData)
        .where(eq(shipments.id, shipmentId))
        .returning();

      // 3. Trigger order status updates on delivery or shipment dispatch
      if (status === "delivered") {
        await OrderService.updateOrderStatus(
          shipment.orderId,
          "delivered",
          "system",
          undefined,
          `Shipment tracked as delivered at ${location}.`
        );
      } else if (status === "in_transit") {
        await OrderService.updateOrderStatus(
          shipment.orderId,
          "out_for_delivery",
          "system",
          undefined,
          `Order is in transit. Carrier: ${shipment.providerName}. Tracking: ${shipment.trackingNumber}`
        );
      }

      return shipment;
    });
  }
}
