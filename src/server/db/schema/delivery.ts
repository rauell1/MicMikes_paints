import { pgSchema, uuid, text, integer, boolean, timestamp, char, bigserial } from "drizzle-orm/pg-core";
import { orders } from "./commerce";

export const deliverySchema = pgSchema("delivery");

export const deliveryZones = deliverySchema.table("delivery_zones", {
  id: uuid("id").primaryKey().defaultRandom(),
  countryCode: char("country_code", { length: 2 }).notNull().default("KE"),
  countyCode: text("county_code"),
  subcountyCode: text("subcounty_code"),
  locality: text("locality"),
  zoneName: text("zone_name").notNull(),
  baseFeeMinor: integer("base_fee_minor").notNull().default(0),
  freeDeliveryThresholdMinor: integer("free_delivery_threshold_minor"), // null = never free
  estimatedDaysMin: integer("estimated_days_min").notNull().default(1),
  estimatedDaysMax: integer("estimated_days_max").notNull().default(3),
  isActive: boolean("is_active").notNull().default(true)
});

export const shipments = deliverySchema.table("shipments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  deliveryZoneId: uuid("delivery_zone_id").references(() => deliveryZones.id),
  providerType: text("provider_type", { enum: ["internal_fleet", "third_party"] }).notNull(),
  providerName: text("provider_name"),
  trackingNumber: text("tracking_number"),
  status: text("status", { enum: ["pending", "scheduled", "picked", "in_transit", "delivered", "failed", "returned"] }).notNull(),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const shipmentEvents = deliverySchema.table("shipment_events", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  shipmentId: uuid("shipment_id").notNull().references(() => shipments.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  description: text("description"),
  location: text("location"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow()
});
