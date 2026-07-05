import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, primaryKey, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const now = () => sql`now()`;

export const users = pgTable("users", {
  id:         uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email:      text("email").unique().notNull(),
  name:       text("name"),
  phone:      text("phone"),
  role:       text("role").notNull().default("customer"),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().default(now()),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().default(now()),
});

export const colours = pgTable("colours", {
  id:     uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code:   text("code").unique().notNull(),
  name:   text("name").notNull(),
  hex:    text("hex").notNull(),
  family: text("family").notNull(),
});

export const products = pgTable("products", {
  id:        uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slug:      text("slug").unique().notNull(),
  name:      text("name").notNull(),
  blurb:     text("blurb"),
  category:  text("category").notNull(),
  imageUrl:  text("image_url"),
  active:    boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now()),
});

export const variants = pgTable("variants", {
  id:        uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  size:      text("size").notNull(),
  priceKes:  integer("price_kes").notNull(),
}, t => [unique().on(t.productId, t.size)]);

export const productColours = pgTable("product_colours", {
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  colourId:  uuid("colour_id").notNull().references(() => colours.id, { onDelete: "cascade" }),
}, t => [primaryKey({ columns: [t.productId, t.colourId] })]);

export const rooms = pgTable("rooms", {
  id:        uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name:      text("name").notNull(),
  photoUrl:  text("photo_url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** Delivery rates keyed by county + optional town. */
export const deliveryRates = pgTable("delivery_rates", {
  id:        uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  county:    text("county").notNull(),
  town:      text("town"),          // NULL = county-level default
  rateKes:   integer("rate_kes").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now()),
}, t => [unique().on(t.county, t.town)]);

export const orders = pgTable("orders", {
  id:             uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:         uuid("user_id").references(() => users.id),
  status:         text("status").notNull().default("pending"),
  subtotalKes:    integer("subtotal_kes").notNull(),
  deliveryKes:    integer("delivery_kes").notNull().default(0),
  totalKes:       integer("total_kes").notNull(),
  name:           text("name").notNull(),
  email:          text("email").notNull(),
  phone:          text("phone").notNull(),
  county:         text("county").notNull(),
  town:           text("town").notNull(),
  address:        text("address").notNull(),
  mpesaRef:       text("mpesa_ref"),
  checkoutReqId:  text("checkout_req_id"),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().default(now()),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().default(now()),
});

export const orderItems = pgTable("order_items", {
  id:        uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId:   uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id),
  colourId:  uuid("colour_id").references(() => colours.id),
  size:      text("size").notNull(),
  finish:    text("finish").notNull(),
  quantity:  integer("quantity").notNull().default(1),
  unitKes:   integer("unit_kes").notNull(),
});

export const orderEvents = pgTable("order_events", {
  id:        uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId:   uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  payload:   jsonb("payload"),
  actorId:   uuid("actor_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now()),
});

export const cartEvents = pgTable("cart_events", {
  id:        uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: text("session_id").notNull(),
  userId:    uuid("user_id").references(() => users.id),
  eventType: text("event_type").notNull(),
  productId: uuid("product_id").references(() => products.id),
  colourId:  uuid("colour_id").references(() => colours.id),
  size:      text("size"),
  finish:    text("finish"),
  quantity:  integer("quantity"),
  unitKes:   integer("unit_kes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now()),
});

export const invoices = pgTable("invoices", {
  id:        uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId:   uuid("order_id").unique().notNull().references(() => orders.id, { onDelete: "cascade" }),
  invoiceNo: text("invoice_no").unique().notNull(),
  pdfUrl:    text("pdf_url"),
  issuedAt:  timestamp("issued_at", { withTimezone: true }).notNull().default(now()),
});

export const savedColours = pgTable("saved_colours", {
  id:       uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:   uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  colourId: uuid("colour_id").notNull().references(() => colours.id, { onDelete: "cascade" }),
  savedAt:  timestamp("saved_at", { withTimezone: true }).notNull().default(now()),
}, t => [unique().on(t.userId, t.colourId)]);
