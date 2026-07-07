import { pgSchema, bigserial, uuid, text, timestamp, jsonb, date, numeric } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const analyticsSchema = pgSchema("analytics");

export const events = analyticsSchema.table("events", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  customerId: uuid("customer_id"),
  sessionId: text("session_id"),
  eventName: text("event_name").notNull(),
  pagePath: text("page_path"),
  entityType: text("entity_type"),
  entityId: uuid("entity_id"),
  eventTs: timestamp("event_ts", { withTimezone: true }).notNull().defaultNow(),
  properties: jsonb("properties").notNull().default(sql`'{}'::jsonb`)
});

export const funnelSnapshots = analyticsSchema.table("funnel_snapshots", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  funnelStage: text("funnel_stage").notNull(),
  visitorCount: integer("visitor_count").notNull().default(0),
  conversionRate: numeric("conversion_rate", { precision: 6, scale: 4 }),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow()
});

import { integer } from "drizzle-orm/pg-core";
