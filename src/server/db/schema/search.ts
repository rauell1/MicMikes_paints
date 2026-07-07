import { pgSchema, uuid, jsonb, timestamp, customType, bigserial, text, integer } from "drizzle-orm/pg-core";
import { productVariants } from "./catalog";
import { sql } from "drizzle-orm";

export const searchSchema = pgSchema("search");

// Custom type for PostgreSQL tsvector search index support in Drizzle
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  }
});

export const productDocuments = searchSchema.table("product_documents", {
  variantId: uuid("variant_id").primaryKey().references(() => productVariants.id, { onDelete: "cascade" }),
  vendorId: uuid("vendor_id").notNull(),
  productId: uuid("product_id").notNull(),
  searchableText: tsvector("searchable_text").notNull(),
  filterJson: jsonb("filter_json").notNull(), // shade_family, finish, room_tags, price_band
  rankingFeatures: jsonb("ranking_features").notNull().default(sql`'{}'::jsonb`),
  lastIndexedAt: timestamp("last_indexed_at", { withTimezone: true }).notNull().defaultNow()
});

export const queryLogs = searchSchema.table("query_logs", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  customerId: uuid("customer_id"),
  sessionId: text("session_id"),
  queryText: text("query_text").notNull(),
  resultCount: integer("result_count"),
  clickedVariantId: uuid("clicked_variant_id"),
  queriedAt: timestamp("queried_at", { withTimezone: true }).notNull().defaultNow()
});
