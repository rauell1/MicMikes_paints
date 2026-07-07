import { pgSchema, uuid, text, boolean, timestamp, char, integer } from "drizzle-orm/pg-core";
import { staffUsers } from "./iam";

export const vendorSchema = pgSchema("vendor");

export const vendors = vendorSchema.table("vendors", {
  id: uuid("id").primaryKey().defaultRandom(),
  vendorType: text("vendor_type", { enum: ["first_party", "third_party"] }).notNull(),
  legalName: text("legal_name").notNull(),
  displayName: text("display_name").notNull(),
  slug: text("slug").notNull().unique(),
  email: text("email"),
  phoneE164: text("phone_e164"),
  whatsappE164: text("whatsapp_e164"),
  websiteUrl: text("website_url"),
  status: text("status", { enum: ["pending", "verified", "rejected", "suspended"] }).notNull().default("pending"),
  countryCode: char("country_code", { length: 2 }).notNull().default("KE"),
  countyCode: text("county_code"),
  subcountyCode: text("subcounty_code"),
  locality: text("locality"),
  estate: text("estate"),
  landmark: text("landmark"),
  logoMediaId: uuid("logo_media_id"),
  brandSummary: text("brand_summary"),
  verificationLevel: text("verification_level", { enum: ["basic", "standard", "enhanced"] }).notNull().default("basic"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const vendorContacts = vendorSchema.table("vendor_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  vendorId: uuid("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  roleTitle: text("role_title"),
  email: text("email"),
  phoneE164: text("phone_e164"),
  isPrimary: boolean("is_primary").notNull().default(false)
});

export const vendorComplianceDocuments = vendorSchema.table("vendor_compliance_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  vendorId: uuid("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  docType: text("doc_type").notNull(), // 'kra_pin','business_registration','county_permit','manufacturer_cert'
  docNumber: text("doc_number"),
  issuingCountry: char("issuing_country", { length: 2 }),
  status: text("status", { enum: ["pending", "approved", "rejected", "expired"] }).notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  mediaId: uuid("media_id"),
  reviewedBy: uuid("reviewed_by").references(() => staffUsers.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  notes: text("notes")
});

export const vendorUsers = vendorSchema.table("vendor_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  vendorId: uuid("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  phoneE164: text("phone_e164"),
  fullName: text("full_name").notNull(),
  status: text("status", { enum: ["invited", "active", "suspended"] }).notNull().default("invited"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [
  // UNIQUE(vendor_id, email) is mapped in Drizzle via compound unique indices or constraints if needed.
]);

export const payoutConfigs = vendorSchema.table("payout_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  vendorId: uuid("vendor_id").notNull().unique().references(() => vendors.id, { onDelete: "cascade" }),
  payoutMethod: text("payout_method", { enum: ["mpesa", "bank_transfer"] }).notNull(),
  accountName: text("account_name").notNull(),
  accountNumber: text("account_number").notNull(), // encrypted at application layer
  bankCode: text("bank_code"),
  mpesaShortcode: text("mpesa_shortcode"),
  currencyCode: char("currency_code", { length: 3 }).notNull().default("KES"),
  minPayoutMinor: integer("min_payout_minor").notNull().default(100000), // KES 1,000 in cents
  payoutSchedule: text("payout_schedule", { enum: ["daily", "weekly", "monthly", "manual"] }).notNull().default("weekly"),
  isVerified: boolean("is_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
