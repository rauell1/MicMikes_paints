import { db } from "../db/client";
import { orders, orderItems } from "../db/schema/commerce";
import { and, gte, lte, eq, or } from "drizzle-orm";

export class RegulatoryExportJob {
  /**
   * Aggregate paid orders and compile VAT ledger details for KRA portal audits.
   */
  static async exportKraVatReport(startDate: Date, endDate: Date) {
    try {
      console.log(`📊 Compiling KRA VAT tax report between ${startDate.toISOString()} and ${endDate.toISOString()}...`);

      // 1. Fetch paid or delivered orders in range
      const completedOrders = await db
        .select()
        .from(orders)
        .where(
          and(
            or(eq(orders.status, "paid"), eq(orders.status, "delivered")),
            gte(orders.placedAt, startDate),
            lte(orders.placedAt, endDate)
          )
        );

      if (completedOrders.length === 0) {
        return { recordsCompiled: 0, csvContent: "" };
      }

      // 2. Format as a CSV string
      const headers = ["Order Number", "Date", "Base Amount (KES)", "VAT Amount (KES)", "Discount (KES)", "Total Amount (KES)"];
      const rows = [headers.join(",")];

      for (const order of completedOrders) {
        const baseKes = (order.subtotalMinor / 100).toFixed(2);
        const taxKes = (order.taxMinor / 100).toFixed(2);
        const discountKes = (order.discountMinor / 100).toFixed(2);
        const totalKes = (order.totalMinor / 100).toFixed(2);
        const dateStr = order.placedAt.toISOString().split("T")[0];

        rows.push([
          order.orderNumber,
          dateStr,
          baseKes,
          taxKes,
          discountKes,
          totalKes
        ].join(","));
      }

      const csvContent = rows.join("\n");
      console.log(`✅ Compiled KRA VAT report with ${completedOrders.length} records.`);

      // In production: write CSV to Vercel Blob or SFTP export directory
      // e.g. await uploadKraReport(csvContent);

      return {
        recordsCompiled: completedOrders.length,
        csvContent,
      };
    } catch (err) {
      console.error("[RegulatoryExportJob] VAT export compilation failed:", err);
      throw err;
    }
  }
}
