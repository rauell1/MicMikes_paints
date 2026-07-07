import { db } from "../db/client";
import { CatalogRepository } from "./catalog.repo";
import { productVariants, paintSpecs, inventoryItems } from "../db/schema/catalog";
import { eq } from "drizzle-orm";

export class CatalogService {
  /**
   * Get all active products with their variants and inventory details.
   */
  static async getCatalog() {
    try {
      const activeProducts = await CatalogRepository.findActiveProducts();

      const result = [];
      for (const prod of activeProducts) {
        const variants = await db
          .select({
            id: productVariants.id,
            packSizeMl: productVariants.packSizeMl,
            sku: productVariants.sku,
            listPriceMinor: productVariants.listPriceMinor,
            onHandQty: inventoryItems.onHandQty,
          })
          .from(productVariants)
          .leftJoin(inventoryItems, eq(inventoryItems.variantId, productVariants.id))
          .where(eq(productVariants.productId, prod.id));

        const specs = await CatalogRepository.findSpecsByProductId(prod.id);

        result.push({
          ...prod,
          variants,
          specs,
        });
      }

      return result;
    } catch (err) {
      console.error("[CatalogService] Failed to fetch catalog:", err);
      throw err;
    }
  }

  /**
   * Get all active paint shades, grouped by color family.
   */
  static async getShades() {
    try {
      const families = await CatalogRepository.findAllColourFamilies();
      const activeShades = await CatalogRepository.findActiveShades();

      return families.map((fam) => ({
        ...fam,
        shades: activeShades.filter((shade) => shade.familyId === fam.id),
      }));
    } catch (err) {
      console.error("[CatalogService] Failed to fetch shades:", err);
      throw err;
    }
  }

  /**
   * Get detailed product data by slug.
   */
  static async getProductBySlug(slug: string) {
    try {
      const prod = await CatalogRepository.findProductBySlug(slug);
      if (!prod) return null;

      const variants = await db
        .select({
          id: productVariants.id,
          packSizeMl: productVariants.packSizeMl,
          sku: productVariants.sku,
          listPriceMinor: productVariants.listPriceMinor,
          onHandQty: inventoryItems.onHandQty,
        })
        .from(productVariants)
        .leftJoin(inventoryItems, eq(inventoryItems.variantId, productVariants.id))
        .where(eq(productVariants.productId, prod.id));

      const specs = await CatalogRepository.findSpecsByProductId(prod.id);

      return {
        ...prod,
        variants,
        specs,
      };
    } catch (err) {
      console.error(`[CatalogService] Failed to fetch product ${slug}:`, err);
      throw err;
    }
  }
}
