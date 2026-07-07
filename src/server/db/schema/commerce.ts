import { pgSchema, uuid, text, char, integer, timestamp, bigserial } from "drizzle-orm/pg-core";
import { customers, addresses } from "./customer";
import { promotions, productVariants } from "./catalog";
import { vendors } from "./vendor";

export const commerceSchema = pgSchema("commerce");

export const carts = commerceSchema.table("carts", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  sessionId: text("session_id"),
  currencyCode: char("currency_code", { length: 3 }).notNull().default("KES"),
  status: text("status", { enum: ["active", "converted", "abandoned", "merged"] }).notNull().default("active"),
  couponCode: text("coupon_code"),
  promoId: uuid("promo_id").references(() => promotions.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const cartItems = commerceSchema.table("cart_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  cartId: uuid("cart_id").notNull().references(() => carts.id, { onDelete: "cascade" }),
  variantId: uuid("variant_id").notNull().references(() => productVariants.id),
  quantity: integer("quantity").notNull(),
  unitPriceMinor: integer("unit_price_minor").notNull(),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [
  // UNIQUE(cart_id, variant_id)
]);

export const orders = commerceSchema.table("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderNumber: text("order_number").notNull().unique(),
  customerId: uuid("customer_id").references(() => customers.id),
  vendorId: uuid("vendor_id").notNull().references(() => vendors.id),
  status: text("status", { enum: ["pending_payment", "paid", "confirmed", "packed", "out_for_delivery", "delivered", "cancelled", "refunded"] }).notNull(),
  currencyCode: char("currency_code", { length: 3 }).notNull().default("KES"),
  subtotalMinor: integer("subtotal_minor").notNull(),
  discountMinor: integer("discount_minor").notNull().default(0),
  shippingMinor: integer("shipping_minor").notNull().default(0),
  taxMinor: integer("tax_minor").notNull().default(0),
  totalMinor: integer("total_minor").notNull(),
  paymentStatus: text("payment_status", { enum: ["unpaid", "pending", "paid", "failed", "partially_refunded", "refunded"] }).notNull(),
  fulfillmentStatus: text("fulfillment_status").notNull().default("unfulfilled"),
  promoId: uuid("promo_id").references(() => promotions.id),
  billingAddressId: uuid("billing_address_id").references(() => addresses.id),
  shippingAddressId: uuid("shipping_address_id").references(() => addresses.id),
  notes: text("notes"),
  placedAt: timestamp("placed_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const orderItems = commerceSchema.table("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  variantId: uuid("variant_id").references(() => productVariants.id),
  productName: text("product_name").notNull(),
  shadeName: text("shade_name"),
  finishName: text("finish_name"),
  packSizeMl: integer("pack_size_ml"),
  vendorSku: text("vendor_sku"),
  quantity: integer("quantity").notNull(),
  unitPriceMinor: integer("unit_price_minor").notNull(),
  lineDiscountMinor: integer("line_discount_minor").notNull().default(0),
  taxMinor: integer("tax_minor").notNull().default(0),
  lineTotalMinor: integer("line_total_minor").notNull()
});

export const orderStatusHistory = commerceSchema.table("order_status_history", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  changedByType: text("changed_by_type", { enum: ["staff", "system", "vendor", "customer"] }),
  changedById: uuid("changed_by_id"),
  notes: text("notes"),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow()
});
