import { db } from "../db/client";
import { productVariants } from "../db/schema/catalog";
import { promotions } from "../db/schema/catalog";
import { taxRules } from "../db/schema/regulatory";
import { eq, and, gt, lt, lte, gte } from "drizzle-orm";

export class PricingService {
  /**
   * Calculate pricing for a variant, returning base price, VAT, and total.
   */
  static async calculateVariantPrice(variantId: string, countryCode: string = "KE") {
    try {
      const [variant] = await db
        .select()
        .from(productVariants)
        .where(eq(productVariants.id, variantId))
        .limit(1);

      if (!variant) {
        throw new Error("Variant not found");
      }

      const listPriceMinor = variant.listPriceMinor;

      // Look up applicable VAT rate (in bps, e.g. 1600 = 16%)
      const [taxRule] = await db
        .select()
        .from(taxRules)
        .where(
          and(
            eq(taxRules.countryCode, countryCode),
            eq(taxRules.taxName, "VAT"),
            eq(taxRules.isActive, true)
          )
        )
        .limit(1);

      const rateBps = taxRule ? taxRule.rateBps : 1600; // default to 16% if not found
      const isInclusive = taxRule ? taxRule.isInclusive : false;

      let basePriceMinor = listPriceMinor;
      let taxAmountMinor = 0;

      if (isInclusive) {
        // Price includes tax: base = price / (1 + rate)
        basePriceMinor = Math.round((listPriceMinor * 10000) / (10000 + rateBps));
        taxAmountMinor = listPriceMinor - basePriceMinor;
      } else {
        // Price excludes tax: tax = price * rate
        taxAmountMinor = Math.round((listPriceMinor * rateBps) / 10000);
      }

      return {
        basePriceMinor,
        taxAmountMinor,
        totalPriceMinor: basePriceMinor + taxAmountMinor,
      };
    } catch (err) {
      console.error(`[PricingService] Failed to calculate price for variant ${variantId}:`, err);
      throw err;
    }
  }

  /**
   * Apply coupon code discount to subtotal.
   */
  static async applyCoupon(subtotalMinor: number, couponCode?: string) {
    if (!couponCode) return { discountMinor: 0, finalSubtotalMinor: subtotalMinor, promotionId: null };

    try {
      const [promo] = await db
        .select()
        .from(promotions)
        .where(
          and(
            eq(promotions.code, couponCode.toUpperCase()),
            eq(promotions.isActive, true)
          )
        )
        .limit(1);

      if (!promo) {
        return { discountMinor: 0, finalSubtotalMinor: subtotalMinor, promotionId: null, error: "Invalid coupon code" };
      }

      // Check dates
      const now = new Date();
      if (promo.startsAt && promo.startsAt > now) {
        return { discountMinor: 0, finalSubtotalMinor: subtotalMinor, promotionId: null, error: "Coupon is not active yet" };
      }
      if (promo.endsAt && promo.endsAt < now) {
        return { discountMinor: 0, finalSubtotalMinor: subtotalMinor, promotionId: null, error: "Coupon has expired" };
      }

      let discountMinor = 0;
      const numericVal = parseFloat(promo.value);
      if (promo.promoType === "percent_off") {
        discountMinor = Math.round((subtotalMinor * numericVal) / 100);
      } else if (promo.promoType === "flat_off") {
        discountMinor = Math.round(numericVal * 100);
      }

      // Ensure discount doesn't exceed subtotal
      discountMinor = Math.min(discountMinor, subtotalMinor);

      return {
        discountMinor,
        finalSubtotalMinor: subtotalMinor - discountMinor,
        promotionId: promo.id,
      };
    } catch (err) {
      console.error(`[PricingService] Failed to apply coupon ${couponCode}:`, err);
      return { discountMinor: 0, finalSubtotalMinor: subtotalMinor, promotionId: null, error: "Server error applying coupon" };
    }
  }
}
