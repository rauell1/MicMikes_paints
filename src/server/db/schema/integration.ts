import { pgSchema, uuid, text, jsonb, timestamp, integer } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const integrationSchema = pgSchema("integration");

export const webhookEvents = integrationSchema.table("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceSystem: text("source_system").notNull(),
  eventType: text("event_type").notNull(),
  externalId: text("external_id"),
  idempotencyKey: text("idempotency_key").unique(),
  payload: jsonb("payload").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  status: text("status", { enum: ["pending", "processing", "processed", "failed", "skipped"] }).notNull().default("pending"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0)
});

export const outboxEvents = integrationSchema.table("outbox_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  aggregateType: text("aggregate_type").notNull(), // 'order','payment','vendor','customer'
  aggregateId: uuid("aggregate_id").notNull(),
  eventType: text("event_type").notNull(), // 'order.created','payment.succeeded', etc.
  payload: jsonb("payload").notNull(),
  targetSystem: text("target_system").notNull(), // 'crm','erp','logistics','email','sms'
  status: text("status", { enum: ["pending", "sent", "failed"] }).notNull().default("pending"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
