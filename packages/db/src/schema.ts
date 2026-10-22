import { relations } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

/** French is the base language, `en` and `ar` fill in as translations are added. */
export type Localized = { fr: string; en?: string; ar?: string }

export const currency = pgEnum("currency", ["TND", "EUR"])
export const productStatus = pgEnum("product_status", ["draft", "published", "archived"])
export const orderStatus = pgEnum("order_status", ["pending_payment", "paid", "fulfilled", "cancelled", "refunded"])
export const requestStatus = pgEnum("request_status", ["new", "contacted", "done", "declined"])

export const admins = pgTable("admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const adminSessions = pgTable("admin_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  adminId: uuid("admin_id")
    .notNull()
    .references(() => admins.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
})

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: jsonb("name").$type<Localized>().notNull(),
  description: jsonb("description").$type<Localized>(),
  /** `s3:<key>` for an upload, `/path` for a file shipped with the web app. */
  image: text("image"),
  visible: boolean("visible").notNull().default(true),
  position: integer("position").notNull().default(0),
})

/**
 * Money: every product carries both prices, chosen by the owner (10 TND and 34 EUR is fine).
 * TND is stored in millimes (1 TND = 1000), EUR in cents.
 */
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The catalogue reference, "0010". */
    ref: text("ref").notNull().unique(),
    slug: text("slug").notNull().unique(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    title: jsonb("title").$type<Localized>().notNull(),
    description: jsonb("description").$type<Localized>(),
    material: jsonb("material").$type<Localized>(),
    technique: jsonb("technique").$type<Localized>(),
    dimensions: text("dimensions"),
    /** Packed weight and box size, the inputs of the shipping estimate. Placeholders until the owner weighs the pieces. */
    weightGrams: integer("weight_grams").notNull().default(1000),
    lengthCm: integer("length_cm").notNull().default(20),
    widthCm: integer("width_cm").notNull().default(20),
    heightCm: integer("height_cm").notNull().default(10),
    priceTnd: integer("price_tnd").notNull(),
    priceEur: integer("price_eur").notNull(),
    stock: integer("stock").notNull().default(1),
    /** A one-off piece: shown as "pièce unique", leaves the shop when sold. */
    unique: boolean("unique").notNull().default(false),
    status: productStatus("status").notNull().default("draft"),
    /** Shown as "ask for a quote" with no cart button: commissions and very expensive pieces. */
    quoteOnly: boolean("quote_only").notNull().default(false),
    featured: boolean("featured").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("products_category_idx").on(t.categoryId), index("products_status_idx").on(t.status)],
)

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    image: text("image").notNull(),
    alt: text("alt"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("product_images_product_idx").on(t.productId)],
)

/**
 * Options of one product (glazed or not, ...). A product with variants takes its price and stock from the chosen
 * variant; the product's own prices stay as the "from" price shown on cards.
 */
export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    label: jsonb("label").$type<Localized>().notNull(),
    priceTnd: integer("price_tnd").notNull(),
    priceEur: integer("price_eur").notNull(),
    stock: integer("stock").notNull().default(1),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("product_variants_product_idx").on(t.productId)],
)

/** Workshop and studio addresses, edited in the dashboard. */
export const locations = pgTable("locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: jsonb("description").$type<Localized>(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  country: text("country").notNull().default("Tunisie"),
  phone: text("phone"),
  hours: jsonb("hours").$type<Localized>(),
  mapUrl: text("map_url"),
  image: text("image"),
  visible: boolean("visible").notNull().default(true),
  position: integer("position").notNull().default(0),
})

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** What the customer sees and quotes: CER-1042. */
    number: text("number").notNull().unique(),
    /** Unguessable, lets the customer open their order page without an account. */
    publicToken: text("public_token").notNull(),
    status: orderStatus("status").notNull().default("pending_payment"),
    currency: currency("currency").notNull(),
    subtotalMinor: integer("subtotal_minor").notNull(),
    shippingMinor: integer("shipping_minor").notNull().default(0),
    totalMinor: integer("total_minor").notNull(),
    customerName: text("customer_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    /** ISO 3166-1 alpha-2 code. */
    country: text("country").notNull(),
    city: text("city").notNull(),
    address: text("address").notNull(),
    postalCode: text("postal_code"),
    note: text("note"),
    locale: text("locale").notNull().default("fr"),
    paymentProvider: text("payment_provider"),
    paymentRef: text("payment_ref"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("orders_payment_ref_idx").on(t.paymentRef),
    index("orders_status_idx").on(t.status),
    index("orders_created_idx").on(t.createdAt),
  ],
)

/** Title and price are copied at order time so later edits never rewrite history. */
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    ref: text("ref").notNull(),
    title: text("title").notNull(),
    unitMinor: integer("unit_minor").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
)

/** "Create a unique piece" requests. The owner answers by email himself. */
export const customRequests = pgTable(
  "custom_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    country: text("country"),
    description: text("description").notNull(),
    dimensions: text("dimensions"),
    budget: text("budget"),
    references: text("references"),
    status: requestStatus("status").notNull().default("new"),
    adminNote: text("admin_note"),
    locale: text("locale").notNull().default("fr"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("custom_requests_status_idx").on(t.status)],
)

/** Single-row key/value store for owner-editable settings (contact, shipping fees). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
})

export const categoriesRelations = relations(categories, ({ many }) => ({ products: many(products) }))
export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  images: many(productImages),
  variants: many(productVariants),
}))
export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
}))
export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, { fields: [productImages.productId], references: [products.id] }),
}))
export const ordersRelations = relations(orders, ({ many }) => ({ items: many(orderItems) }))
export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}))
export const adminSessionsRelations = relations(adminSessions, ({ one }) => ({
  admin: one(admins, { fields: [adminSessions.adminId], references: [admins.id] }),
}))
