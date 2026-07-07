import { pgSchema, uuid, text, boolean, timestamp, char, numeric } from "drizzle-orm/pg-core";
import { productVariants, shades, finishes } from "./catalog";

export const customerSchema = pgSchema("customer");

export const customers = customerSchema.table("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique(),
  phoneE164: text("phone_e164").unique(),
  fullName: text("full_name"),
  status: text("status", { enum: ["active", "disabled"] }).notNull().default("active"),
  marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
  analyticsConsent: boolean("analytics_consent").notNull().default(false),
  dataExportRequestedAt: timestamp("data_export_requested_at", { withTimezone: true }),
  deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true }),
  countryCode: char("country_code", { length: 2 }).notNull().default("KE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const addresses = customerSchema.table("addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
  countryCode: char("country_code", { length: 2 }).notNull().default("KE"),
  countyCode: text("county_code"),      // e.g. 'NBI' (Nairobi), 'KSM' (Kisumu)
  subcountyCode: text("subcounty_code"),
  locality: text("locality"),          // e.g. 'Westlands', 'Karen'
  estate: text("estate"),              // e.g. 'Spring Valley', 'Lavington'
  buildingName: text("building_name"),
  houseUnit: text("house_unit"),
  landmark: text("landmark"),          // e.g. 'Opp. Junction Mall'
  recipientName: text("recipient_name").notNull(),
  recipientPhoneE164: text("recipient_phone_e164").notNull(),
  postalCode: text("postal_code"),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const wishlists = customerSchema.table("wishlists", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  variantId: uuid("variant_id").notNull().references(() => productVariants.id, { onDelete: "cascade" })
}, (t) => [
  // UNIQUE(customer_id, variant_id)
]);

export const savedRooms = customerSchema.table("saved_rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  roomName: text("room_name"),
  roomType: text("room_type"),
  shadeId: uuid("shade_id").references(() => shades.id),
  finishId: uuid("finish_id").references(() => finishes.id),
  mediaId: uuid("media_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const refillReminders = customerSchema.table("refill_reminders", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  orderId: uuid("order_id"), // references commerce.orders
  variantId: uuid("variant_id").references(() => productVariants.id),
  remindAt: timestamp("remind_at", { withTimezone: true }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true)
});
