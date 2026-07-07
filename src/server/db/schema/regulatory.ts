import { pgSchema, uuid, text, integer, boolean, timestamp, char, date } from "drizzle-orm/pg-core";
import { vendors } from "./vendor";

export const regulatorySchema = pgSchema("regulatory");

export const taxRules = regulatorySchema.table("tax_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  countryCode: char("country_code", { length: 2 }).notNull().default("KE"),
  categoryCode: text("category_code"),
  productType: text("product_type"),
  taxName: text("tax_name").notNull(), // 'VAT', 'Excise', 'County Levy'
  rateBps: integer("rate_bps").notNull(), // e.g. 1600 = 16% VAT
  isInclusive: boolean("is_inclusive").notNull().default(false),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
  effectiveTo: timestamp("effective_to", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true)
});

export const vendorComplianceRecords = regulatorySchema.table("vendor_compliance_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  vendorId: uuid("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  recordType: text("record_type").notNull(), // 'kra_pin','county_business_permit','nema_cert'
  recordValue: text("record_value"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  isCurrent: boolean("is_current").notNull().default(true)
});

export const taxExportBatches = regulatorySchema.table("tax_export_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  status: text("status", { enum: ["pending", "generated", "submitted", "acknowledged"] }).notNull().default("pending"),
  fileKey: text("file_key"),
  totalTaxMinor: integer("total_tax_minor"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
