import { db } from "../db/client";
import { productVariants, inventoryItems } from "../db/schema/catalog";
import { eq } from "drizzle-orm";

export class ErpInventorySyncJob {
  /**
   * Sync inventory counts from ERP to catalog inventory items.
   */
  static async syncStock() {
    try {
      console.log("⚙️ Starting ERP catalog inventory synchronization...");
      const variantsList = await db.select().from(productVariants);

      let syncedCount = 0;
      for (const variant of variantsList) {
        // Simulate pulling stock levels from vendor ERP API
        // In production: const erpStock = await fetchErpStock(variant.sku);
        const simulatedErpStock = Math.floor(50 + Math.random() * 150); // random stock level

        // Upsert inventory record
        const [existing] = await db
          .select()
          .from(inventoryItems)
          .where(eq(inventoryItems.variantId, variant.id))
          .limit(1);

        if (existing) {
          await db
            .update(inventoryItems)
            .set({
              onHandQty: simulatedErpStock,
              updatedAt: new Date(),
            })
            .where(eq(inventoryItems.variantId, variant.id));
        } else {
          await db.insert(inventoryItems).values({
            variantId: variant.id,
            onHandQty: simulatedErpStock,
            reservedQty: 0,
            reorderLevel: 10,
          });
        }
        syncedCount++;
      }

      console.log(`✅ ERP Sync completed. Updated ${syncedCount} variants.`);
      return { syncedCount };
    } catch (err) {
      console.error("[ErpInventorySyncJob] Sync failed:", err);
      throw err;
    }
  }
}
