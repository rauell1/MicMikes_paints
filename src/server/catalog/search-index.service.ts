import { db } from "../db/client";
import { productVariants, products, shades, finishes, paintSpecs } from "../db/schema/catalog";
import { eq, sql } from "drizzle-orm";

export class SearchIndexService {
  /**
   * Reindex a single variant in search.product_documents.
   */
  static async reindexVariant(variantId: string) {
    try {
      // 1. Fetch variant with product and shade info
      const [variant] = await db
        .select()
        .from(productVariants)
        .where(eq(productVariants.id, variantId))
        .limit(1);

      if (!variant) return;

      const [prod] = await db
        .select()
        .from(products)
        .where(eq(products.id, variant.productId))
        .limit(1);

      if (!prod) return;

      // Fetch spec and shade if applicable
      const [specs] = await db
        .select()
        .from(paintSpecs)
        .where(eq(paintSpecs.productId, prod.id))
        .limit(1);

      let shadeName = "";
      let shadeHex = "";
      if (variant.shadeId) {
        const [shade] = await db
          .select()
          .from(shades)
          .where(eq(shades.id, variant.shadeId))
          .limit(1);
        if (shade) {
          shadeName = shade.name;
          shadeHex = shade.hexValue ?? "";
        }
      }

      // Build search text
      const searchParts = [
        prod.name,
        prod.shortDescription ?? "",
        prod.longDescription ?? "",
        variant.sku,
        shadeName,
        prod.productType,
      ].filter(Boolean);
      const textToSearch = searchParts.join(" ");

      // Build filter json
      const filterJson = {
        product_type: prod.productType,
        pack_size_ml: variant.packSizeMl,
        shade_name: shadeName,
        shade_hex: shadeHex,
        room_tags: prod.roomTags || [],
        recommended_use: prod.recommendedUse || [],
        is_exterior: prod.isExteriorGrade || false,
        price_minor: variant.listPriceMinor,
      };

      // Build ranking features (can be loaded from sales data later)
      const rankingFeatures = {
        sales_weight: 1.0,
        recency_weight: prod.isNewRelease ? 1.5 : 1.0,
        featured_weight: prod.isFeatured ? 2.0 : 1.0,
      };

      // 2. Perform upsert with raw SQL to handle the tsvector type
      await db.execute(sql`
        INSERT INTO search.product_documents (variant_id, vendor_id, product_id, searchable_text, filter_json, ranking_features)
        VALUES (
          ${variant.id},
          ${prod.vendorId},
          ${prod.id},
          to_tsvector('english', ${textToSearch}),
          ${JSON.stringify(filterJson)}::jsonb,
          ${JSON.stringify(rankingFeatures)}::jsonb
        )
        ON CONFLICT (variant_id) DO UPDATE SET
          searchable_text = EXCLUDED.searchable_text,
          filter_json = EXCLUDED.filter_json,
          ranking_features = EXCLUDED.ranking_features,
          last_indexed_at = NOW()
      `);
    } catch (err) {
      console.error(`[SearchIndexService] Failed to index variant ${variantId}:`, err);
      throw err;
    }
  }

  /**
   * Reindex all product variants.
   */
  static async reindexAll() {
    try {
      console.log("⚙️ Reindexing all product variants...");
      const variantsList = await db.select({ id: productVariants.id }).from(productVariants);
      
      for (const v of variantsList) {
        await this.reindexVariant(v.id);
      }
      console.log(`✅ Reindexed all ${variantsList.length} variants successfully.`);
    } catch (err) {
      console.error("[SearchIndexService] Reindex all failed:", err);
      throw err;
    }
  }
}
