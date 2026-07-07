import { db } from "../db/client";
import { deliveryZones } from "../db/schema/delivery";
import { DeliveryService } from "./delivery.service";
import { eq, and } from "drizzle-orm";

export class DeliveryZonesService {
  /**
   * Resolve delivery fee for county/town destination.
   */
  static async resolveDeliveryFee(countyCode: string, subcountyCode?: string): Promise<number> {
    return await DeliveryService.getDeliveryRate(countyCode, subcountyCode);
  }

  /**
   * Add a new county or subcounty delivery zone pricing structure.
   */
  static async addZone(data: {
    countyCode: string;
    subcountyCode?: string;
    zoneName: string;
    baseFeeMinor: number;
  }) {
    const [zone] = await db
      .insert(deliveryZones)
      .values({
        id: crypto.randomUUID(),
        countryCode: "KE",
        countyCode: data.countyCode,
        subcountyCode: data.subcountyCode || null,
        zoneName: data.zoneName,
        baseFeeMinor: data.baseFeeMinor,
        freeDeliveryThresholdMinor: null,
        estimatedDaysMin: 1,
        estimatedDaysMax: 3,
        isActive: true,
      })
      .returning();

    return zone;
  }
}
