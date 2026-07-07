import { db } from "../db/client";
import { taxRules } from "../db/schema/regulatory";
import { eq, and } from "drizzle-orm";

export class TaxService {
  /**
   * Compute tax for a given amount using active tax rules.
   */
  static async calculateTax(
    amountMinor: number,
    countryCode: string = "KE",
    taxName: string = "VAT"
  ) {
    try {
      const [rule] = await db
        .select()
        .from(taxRules)
        .where(
          and(
            eq(taxRules.countryCode, countryCode),
            eq(taxRules.taxName, taxName),
            eq(taxRules.isActive, true)
          )
        )
        .limit(1);

      const rateBps = rule ? rule.rateBps : 1600; // default to 16% VAT
      const isInclusive = rule ? rule.isInclusive : false;

      let taxAmountMinor = 0;
      let baseAmountMinor = amountMinor;

      if (isInclusive) {
        // Amount includes tax: tax = amount - (amount / (1 + rate))
        baseAmountMinor = Math.round((amountMinor * 10000) / (10000 + rateBps));
        taxAmountMinor = amountMinor - baseAmountMinor;
      } else {
        // Amount excludes tax: tax = amount * rate
        taxAmountMinor = Math.round((amountMinor * rateBps) / 10000);
      }

      return {
        taxAmountMinor,
        baseAmountMinor,
        rateBps,
        taxName,
        isInclusive,
      };
    } catch (err) {
      console.error(`[TaxService] Failed to calculate tax for ${taxName}:`, err);
      return {
        taxAmountMinor: Math.round((amountMinor * 1600) / 10000), // fallback
        baseAmountMinor: amountMinor,
        rateBps: 1600,
        taxName,
        isInclusive: false,
      };
    }
  }
}
