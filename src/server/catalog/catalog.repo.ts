import { db } from "../db/client";
import { products, productVariants, shades, colourFamilies, paintSpecs } from "../db/schema/catalog";
import { eq, and } from "drizzle-orm";

export class CatalogRepository {
  static async findActiveProducts() {
    return await db.select().from(products).where(eq(products.status, "active"));
  }

  static async findProductBySlug(slug: string) {
    const [prod] = await db
      .select()
      .from(products)
      .where(eq(products.slug, slug))
      .limit(1);
    return prod || null;
  }

  static async findVariantsByProductId(productId: string) {
    return await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, productId));
  }

  static async findSpecsByProductId(productId: string) {
    const [spec] = await db
      .select()
      .from(paintSpecs)
      .where(eq(paintSpecs.productId, productId))
      .limit(1);
    return spec || null;
  }

  static async findAllColourFamilies() {
    return await db.select().from(colourFamilies);
  }

  static async findActiveShades() {
    return await db.select().from(shades).where(eq(shades.isActive, true));
  }
}
