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
export const mailStatus = pgEnum("mail_status", ["sent", "failed", "resent"])
export const requestStatus = pgEnum("request_status", ["new", "contacted", "done", "declined"])

export const admins = pgTable("admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  nameConfirmedAt: timestamp("name_confirmed_at", { withTimezone: true }),
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
    /** "online" (gateway) or "cod" (cash on delivery, Tunisia only). */
    paymentMethod: text("payment_method").notNull().default("online"),
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

/** Who moved an order to which status, and why. Written for every admin status change. */
export const orderAudit = pgTable(
  "order_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    adminId: uuid("admin_id").references(() => admins.id, { onDelete: "set null" }),
    /** "mark_paid_manually" or "set_status". */
    action: text("action").notNull(),
    fromStatus: orderStatus("from_status").notNull(),
    toStatus: orderStatus("to_status").notNull(),
    /** "transfer" | "payoneer" | "cash" | "other" for manual payments. */
    method: text("method"),
    reference: text("reference"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_audit_order_idx").on(t.orderId, t.createdAt)],
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
    /** `s3:<key>` of the photos the customer attached, at most 3. */
    images: jsonb("images").$type<string[]>().notNull().default([]),
    status: requestStatus("status").notNull().default("new"),
    adminNote: text("admin_note"),
    locale: text("locale").notNull().default("fr"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("custom_requests_status_idx").on(t.status)],
)

/** One row per mail the api tried to send. `to` is the real recipient, before any redirect outside production. */
export const mailLog = pgTable(
  "mail_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    /** Kept to resend, emptied after 90 days. */
    text: text("text").notNull(),
    replyTo: text("reply_to"),
    status: mailStatus("status").notNull(),
    providerId: text("provider_id"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [index("mail_log_status_idx").on(t.status, t.createdAt)],
)

/** One row per scheduled job run (`POST /cron/<name>`), kept 90 days. `error` is a short message, never a stack. */
export const jobRuns = pgTable(
  "job_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ok: boolean("ok"),
    counts: jsonb("counts").$type<Record<string, number | string>>().notNull().default({}),
    error: text("error"),
  },
  (t) => [index("job_runs_name_started_idx").on(t.name, t.startedAt.desc())],
)

/** Every file sent to the bucket (dashboard images, customer photos): what the owner's storage counter adds up. */
export const uploads = pgTable(
  "uploads",
  {
    key: text("key").primaryKey(),
    folder: text("folder").notNull(),
    contentType: text("content_type").notNull(),
    bytes: integer("bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Set by the daily cleanup the first time nothing references the file, cleared if it is used again. */
    unusedSince: timestamp("unused_since", { withTimezone: true }),
  },
  (t) => [index("uploads_unused_idx").on(t.unusedSince)],
)

/** Fixed-window counters shared by every api instance: `login:ip:<ip>`, `orders:<ip>`, ... Old rows are swept daily. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
})

/** Single-row key/value store for owner-editable settings (contact, shipping fees). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
})

/** The studio's legal identity, contact and bank account. One row, id "shop". */
export const shopProfile = pgTable("shop_profile", {
  id: text("id").primaryKey().default("shop"),
  legalName: text("legal_name"),
  displayName: text("display_name"),
  legalForm: text("legal_form"),
  /** Matricule fiscal. */
  taxId: text("tax_id"),
  /** RNE / patente. */
  registryNumber: text("registry_number"),
  address: text("address"),
  postalCode: text("postal_code"),
  city: text("city"),
  country: text("country").notNull().default("TN"),
  phones: jsonb("phones").$type<string[]>().notNull().default([]),
  /** Public contact. */
  email: text("email"),
  /** Where studio notifications go, falls back to `email`. */
  notifyEmail: text("notify_email"),
  bankHolder: text("bank_holder"),
  bankName: text("bank_name"),
  bankRib: text("bank_rib"),
  bankIban: text("bank_iban"),
  bankBic: text("bank_bic"),
  invoiceNote: jsonb("invoice_note").$type<Localized>(),
  shippingConfirmedAt: timestamp("shipping_confirmed_at", { withTimezone: true }),
  skippedSteps: jsonb("skipped_steps").$type<string[]>().notNull().default([]),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export type InvoiceSeller = {
  displayName: string | null
  legalName: string | null
  legalForm: string | null
  taxId: string | null
  registryNumber: string | null
  address: string | null
  postalCode: string | null
  city: string | null
  country: string
  phone: string | null
  email: string | null
  invoiceNote: Localized | null
  bank: { holder: string; bank: string; iban: string; bic: string; rib?: string } | null
}

/** Gapless yearly counter: the row is locked by the UPDATE, so two issues never get the same number. */
export const invoiceCounters = pgTable("invoice_counters", {
  year: integer("year").primaryKey(),
  last: integer("last").notNull().default(0),
})

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .unique()
      .references(() => orders.id, { onDelete: "restrict" }),
    /** "2026-0001": year and a 4-digit sequence. */
    number: text("number").notNull().unique(),
    year: integer("year").notNull(),
    seq: integer("seq").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    /** Seller identity frozen at issue time. */
    seller: jsonb("seller").$type<InvoiceSeller>().notNull(),
  },
  (t) => [uniqueIndex("invoices_year_seq_idx").on(t.year, t.seq)],
)

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
export const ordersRelations = relations(orders, ({ many }) => ({ items: many(orderItems), audit: many(orderAudit) }))
export const orderAuditRelations = relations(orderAudit, ({ one }) => ({
  order: one(orders, { fields: [orderAudit.orderId], references: [orders.id] }),
  admin: one(admins, { fields: [orderAudit.adminId], references: [admins.id] }),
}))
export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}))
export const adminSessionsRelations = relations(adminSessions, ({ one }) => ({
  admin: one(admins, { fields: [adminSessions.adminId], references: [admins.id] }),
}))
