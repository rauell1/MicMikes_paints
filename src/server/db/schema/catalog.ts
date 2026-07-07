import { pgSchema, uuid, text, integer, boolean, numeric, timestamp, char } from "drizzle-orm/pg-core";
import { vendors } from "./vendor";

export const catalogSchema = pgSchema("catalog");

export const colourFamilies = catalogSchema.table("colour_families", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0)
});

export const shades = catalogSchema.table("shades", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").references(() => colourFamilies.id, { onDelete: "set null" }),
  code: text("code").notNull().unique(),
  name: text("name").notNull().unique(),
  hexValue: text("hex_value"),
  lrv: numeric("lrv", { precision: 5, scale: 2 }), // Light Reflectance Value 0-100
  undertone: text("undertone"), // 'warm','cool','neutral'
  isActive: boolean("is_active").notNull().default(true)
});

export const finishes = catalogSchema.table("finishes", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  sheenLevel: integer("sheen_level").notNull(), // 1=matte, 2=eggshell, 3=satin, 4=semi-gloss, 5=gloss
  isActive: boolean("is_active").notNull().default(true)
});

export const productCategories: any = catalogSchema.table("product_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  parentId: uuid("parent_id").references((): any => productCategories.id, { onDelete: "set null" }),
  code: text("code").notNull().unique(),
  name: text("name").notNull()
});

export const products = catalogSchema.table("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  vendorId: uuid("vendor_id").notNull().references(() => vendors.id),
  categoryId: uuid("category_id").references(() => productCategories.id),
  productType: text("product_type", { enum: ["paint", "primer", "accessory", "service"] }).notNull(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  shortDescription: text("short_description"),
  longDescription: text("long_description"),
  status: text("status", { enum: ["draft", "active", "archived", "unpublished"] }).notNull().default("draft"),
  isFeatured: boolean("is_featured").notNull().default(false),
  isExteriorGrade: boolean("is_exterior_grade").notNull().default(false),
  isNewRelease: boolean("is_new_release").notNull().default(false),
  roomTags: text("room_tags").array().notNull().default([]), // pg core Array mapping
  recommendedUse: text("recommended_use").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const paintSpecs = catalogSchema.table("paint_specs", {
  productId: uuid("product_id").primaryKey().references(() => products.id, { onDelete: "cascade" }),
  washabilityRating: integer("washability_rating"), // 1-5
  vocLevelGL: numeric("voc_level_g_l", { precision: 8, scale: 2 }),
  coverageM2PerL: numeric("coverage_m2_per_l", { precision: 8, scale: 2 }),
  dryingTimeMinutes: integer("drying_time_minutes"),
  recoatsAfterMinutes: integer("recoats_after_minutes"),
  suitableRooms: text("suitable_rooms").array().notNull().default([]),
  applicationSurfaces: text("application_surfaces").array().notNull().default([])
});

export const productVariants = catalogSchema.table("product_variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  shadeId: uuid("shade_id").references(() => shades.id),
  finishId: uuid("finish_id").references(() => finishes.id),
  packSizeMl: integer("pack_size_ml").notNull(),
  sku: text("sku").notNull().unique(),
  barcode: text("barcode"),
  currencyCode: char("currency_code", { length: 3 }).notNull().default("KES"),
  listPriceMinor: integer("list_price_minor").notNull(),
  salePriceMinor: integer("sale_price_minor"),
  costPriceMinor: integer("cost_price_minor"),
  taxClassCode: text("tax_class_code"),
  stockTracking: boolean("stock_tracking").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  weightGrams: integer("weight_grams"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const inventoryItems = catalogSchema.table("inventory_items", {
  variantId: uuid("variant_id").primaryKey().references(() => productVariants.id, { onDelete: "cascade" }),
  onHandQty: integer("on_hand_qty").notNull().default(0),
  reservedQty: integer("reserved_qty").notNull().default(0),
  reorderLevel: integer("reorder_level"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const mediaAssets = catalogSchema.table("media_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerType: text("owner_type", { enum: ["product", "shade", "vendor", "customer_room", "staff"] }).notNull(),
  ownerId: uuid("owner_id").notNull(),
  mediaKind: text("media_kind", { enum: ["image", "swatch", "visualizer", "document", "video"] }).notNull(),
  storageKey: text("storage_key").notNull(), // Vercel Blob or S3 key
  cdnUrl: text("cdn_url"),
  mimeType: text("mime_type").notNull(),
  width: integer("width"),
  height: integer("height"),
  altText: text("alt_text"),
  moderationStatus: text("moderation_status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const promotions = catalogSchema.table("promotions", {
  id: uuid("id").primaryKey().defaultRandom(),
  vendorId: uuid("vendor_id").references(() => vendors.id),
  code: text("code"),
  name: text("name").notNull(),
  promoType: text("promo_type", { enum: ["percent_off", "flat_off", "bogo", "free_shipping", "bundle"] }).notNull(),
  value: numeric("value", { precision: 10, scale: 2 }).notNull(),
  currencyCode: char("currency_code", { length: 3 }).default("KES"),
  appliesTo: text("applies_to", { enum: ["order", "product", "category", "vendor"] }).notNull(),
  minOrderMinor: integer("min_order_minor"),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").notNull().default(0),
  stackable: boolean("stackable").notNull().default(false),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
