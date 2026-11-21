import { relations, sql } from "drizzle-orm"
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

export const siteImageSlot = pgEnum("site_image_slot", [
  "hero",
  "studio",
  "process",
  "logo",
  "og-home",
  "og-shop",
  "og-atelier",
  "og-custom",
  "texture",
])
export const currency = pgEnum("currency", ["TND", "EUR"])
export const productStatus = pgEnum("product_status", ["draft", "published", "archived"])
export const orderStatus = pgEnum("order_status", ["pending_payment", "paid", "fulfilled", "cancelled", "refunded"])
export const mailStatus = pgEnum("mail_status", ["sent", "failed", "resent"])
export const requestStatus = pgEnum("request_status", ["new", "contacted", "done", "declined"])
export const mediaSource = pgEnum("media_source", ["bucket", "bundled", "external"])

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

/**
 * One row per picture of the site. `key` is the bucket key without `s3:` (bucket), the path shipped with the web app
 * (bundled) or a full URL (external).
 */
export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull().unique(),
    source: mediaSource("source").notNull().default("bucket"),
    filename: text("filename").notNull(),
    originalName: text("original_name"),
    mime: text("mime").notNull().default("image/webp"),
    bytes: integer("bytes").notNull().default(0),
    width: integer("width"),
    height: integer("height"),
    /** sha-256 hex of the stored bytes, null for legacy rows. */
    hash: text("hash"),
    alt: jsonb("alt").$type<Localized>(),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    /** Pinned by the owner: cleanup never deletes it. */
    keep: boolean("keep").notNull().default(false),
    /** Null while the upload is signed but not verified. */
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    unusedSince: timestamp("unused_since", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("media_hash_idx").on(t.hash),
    index("media_created_idx").on(t.createdAt),
    index("media_filename_idx").on(t.filename),
  ],
)

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: jsonb("name").$type<Localized>().notNull(),
  description: jsonb("description").$type<Localized>(),
  /** `s3:<key>` for an upload, `/path` for a file shipped with the web app. */
  image: text("image"),
  imageMediaId: uuid("image_media_id").references(() => media.id, { onDelete: "set null" }),
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
    mediaId: uuid("media_id").references(() => media.id, { onDelete: "restrict" }),
    isMain: boolean("is_main").notNull().default(false),
    /** Per-image override, falls back to `media.alt`. */
    altText: jsonb("alt_text").$type<Localized>(),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    index("product_images_product_idx").on(t.productId),
    uniqueIndex("product_images_main_idx").on(t.productId).where(sql`${t.isMain}`),
  ],
)

/** The named pictures of the storefront (hero slides, logo, share images...). `SITE_SLOTS` in the sdk describes each slot. */
export const siteImages = pgTable(
  "site_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slot: siteImageSlot("slot").notNull(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "restrict" }),
    position: integer("position").notNull().default(0),
    /** Override, falls back to `media.alt`. */
    alt: jsonb("alt").$type<Localized>(),
    visible: boolean("visible").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("site_images_slot_idx").on(t.slot, t.position)],
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
  imageMediaId: uuid("image_media_id").references(() => media.id, { onDelete: "set null" }),
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
    /** "aramex" | "rapid-poste" | "dhl" | "other"; null until shipped. */
    carrier: text("carrier"),
    /** Free text when carrier is "other", e.g. "Transporteur local". */
    carrierName: text("carrier_name"),
    trackingNumber: text("tracking_number"),
    /** https only, built from the carrier template or typed by the owner. */
    trackingUrl: text("tracking_url"),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("orders_payment_ref_idx").on(t.paymentRef),
    index("orders_status_idx").on(t.status),
    index("orders_created_idx").on(t.createdAt),
  ],
)

/** One row per provider. Secrets are AES-256-GCM encrypted (packages/orpc/src/lib/secrets.ts), never plaintext. */
export const integrationCredentials = pgTable("integration_credentials", {
  /** "konnect" | "aramex" | "groq" | ...; one row per provider. */
  provider: text("provider").primaryKey(),
  /** Non-secret settings (wallet id, mode, account number...). Safe to show. */
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  /** `v1.<iv>.<tag>.<ciphertext>` of a JSON object of secret fields. Null: no secret saved. */
  secretsEnc: text("secrets_enc"),
  keyVersion: integer("key_version"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  /** Who last saved or cleared a secret. */
  updatedBy: uuid("updated_by").references(() => admins.id, { onDelete: "set null" }),
})

export const shipmentStatus = pgEnum("shipment_status", [
  "created",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "exception",
  "returned",
  "on_hold",
  "cancelled",
])

/** One carrier tracking event, as the shipping provider reports it. */
export interface ShipmentEvent {
  code: string
  description: string
  /** ISO */
  at: string
  location: string
  comment: string
  problemCode: string | null
}

/**
 * A parcel handed to a carrier (Aramex) for an order. The label is a private object in the bucket (`labelKey`), read
 * only through a short-lived signed link. An order has at most one shipment that is not cancelled.
 */
export const shipments = pgTable(
  "shipments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    /** "aramex" */
    provider: text("provider").notNull(),
    /** "test" | "live" | "fake" */
    environment: text("environment").notNull(),
    waybill: text("waybill").notNull(),
    /** "DOM" | "EXP" */
    productGroup: text("product_group").notNull(),
    productType: text("product_type").notNull(),
    status: shipmentStatus("status").notNull().default("created"),
    /** TND millimes collected on delivery, null when the order is not cash on delivery. */
    codAmountMinor: integer("cod_amount_minor"),
    insuranceMinor: integer("insurance_minor"),
    /** The order's currency, a snapshot. */
    currency: currency("currency").notNull(),
    weightGrams: integer("weight_grams").notNull(),
    pieces: integer("pieces").notNull().default(1),
    /** Bucket key of the label PDF, under `private/labels/`: read only through a signed link, `/files` refuses it. */
    labelKey: text("label_key"),
    /** The carrier's own label link, it may expire. */
    labelUrl: text("label_url"),
    commercialInvoiceKey: text("commercial_invoice_key"),
    pickupId: text("pickup_id"),
    pickupGuid: text("pickup_guid"),
    lastEvent: jsonb("last_event").$type<ShipmentEvent | null>(),
    events: jsonb("events").$type<ShipmentEvent[]>().notNull().default([]),
    errors: jsonb("errors").$type<{ at: string; code: string; message: string }[]>().notNull().default([]),
    lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("shipments_waybill_idx").on(t.provider, t.waybill),
    index("shipments_order_idx").on(t.orderId),
    index("shipments_status_idx").on(t.status),
    uniqueIndex("shipments_active_order_idx").on(t.orderId).where(sql`${t.status} <> 'cancelled'`),
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

/** Monthly AI usage, keyed by the studio month ("2026-11", Africa/Tunis). One row per month. */
export const aiUsage = pgTable("ai_usage", {
  month: text("month").primaryKey(),
  requests: integer("requests").notNull().default(0),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  /** Micro USD, so cents survive as integers. */
  costMicroUsd: integer("cost_micro_usd").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const mediaRelations = relations(media, ({ many }) => ({ productImages: many(productImages) }))
export const categoriesRelations = relations(categories, ({ one, many }) => ({
  products: many(products),
  imageMedia: one(media, { fields: [categories.imageMediaId], references: [media.id] }),
}))
export const locationsRelations = relations(locations, ({ one }) => ({
  imageMedia: one(media, { fields: [locations.imageMediaId], references: [media.id] }),
}))
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
  media: one(media, { fields: [productImages.mediaId], references: [media.id] }),
}))
export const ordersRelations = relations(orders, ({ many }) => ({
  items: many(orderItems),
  audit: many(orderAudit),
  shipments: many(shipments),
}))
export const shipmentsRelations = relations(shipments, ({ one }) => ({
  order: one(orders, { fields: [shipments.orderId], references: [orders.id] }),
}))
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
