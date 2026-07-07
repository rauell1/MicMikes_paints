import { pgSchema, uuid, text, boolean, integer, char, timestamp, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { orders } from "./commerce";

export const paymentSchema = pgSchema("payment");

export const paymentMethods = paymentSchema.table("payment_methods", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  provider: text("provider", { enum: ["mpesa", "stripe", "paystack", "bank", "cash"] }).notNull(),
  countryCode: char("country_code", { length: 2 }),
  currencyCode: char("currency_code", { length: 3 }),
  displayName: text("display_name").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  feeType: text("fee_type", { enum: ["flat", "percent", "hybrid"] }).notNull(),
  feeFlatMinor: integer("fee_flat_minor").notNull().default(0),
  feeBps: integer("fee_bps").notNull().default(0) // basis points
});

export const paymentAttempts = paymentSchema.table("payment_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  paymentMethodId: uuid("payment_method_id").notNull().references(() => paymentMethods.id),
  providerReference: text("provider_reference"),
  providerRequestId: text("provider_request_id"),
  amountMinor: integer("amount_minor").notNull(),
  currencyCode: char("currency_code", { length: 3 }).notNull(),
  phoneE164: text("phone_e164"),
  status: text("status", { enum: ["initiated", "pending", "success", "failed", "cancelled", "expired"] }).notNull(),
  failureReason: text("failure_reason"),
  rawRequest: jsonb("raw_request").notNull().default(sql`'{}'::jsonb`),
  rawResponse: jsonb("raw_response").notNull().default(sql`'{}'::jsonb`),
  reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const refunds = paymentSchema.table("refunds", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  paymentAttemptId: uuid("payment_attempt_id").references(() => paymentAttempts.id),
  amountMinor: integer("amount_minor").notNull(),
  reason: text("reason"),
  status: text("status", { enum: ["requested", "processing", "succeeded", "failed"] }).notNull(),
  providerReference: text("provider_reference"),
  initiatedByType: text("initiated_by_type", { enum: ["staff", "customer", "system"] }),
  initiatedById: uuid("initiated_by_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const legacyMpesaMapping = paymentSchema.table("legacy_mpesa_mapping", {
  newAttemptId: uuid("new_attempt_id").notNull().references(() => paymentAttempts.id),
  legacyRowId: uuid("legacy_row_id").notNull(),
  migratedAt: timestamp("migrated_at", { withTimezone: true }).notNull().defaultNow()
});
