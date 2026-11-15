import { z } from "zod"
import { SHIPPING_COUNTRIES } from "./countries"

export const currencySchema = z.enum(["TND", "EUR"])
export type Currency = z.infer<typeof currencySchema>
export const localeSchema = z.enum(["fr", "en", "ar"])
export type Locale = z.infer<typeof localeSchema>

export const localizedSchema = z.object({ fr: z.string(), en: z.string().optional(), ar: z.string().optional() })
export const localizedInput = (max = 200) =>
  z.object({
    fr: z.string().trim().min(1, "French is required").max(max),
    en: z.string().trim().max(max).optional(),
    ar: z.string().trim().max(max).optional(),
  })

export const productStatusSchema = z.enum(["draft", "published", "archived"])
export const orderStatusSchema = z.enum(["pending_payment", "paid", "fulfilled", "cancelled", "refunded"])
export const paymentMethodSchema = z.enum(["online", "cod", "transfer"])
export type PaymentMethod = z.infer<typeof paymentMethodSchema>

export const paymentMethodFlagsSchema = z.object({ online: z.boolean(), cod: z.boolean(), transfer: z.boolean() })
export type PaymentMethodFlags = z.infer<typeof paymentMethodFlagsSchema>

export const paymentSettingsSchema = z.object({
  methods: paymentMethodFlagsSchema.default({ online: false, cod: true, transfer: true }),
})
export type PaymentSettings = z.infer<typeof paymentSettingsSchema>

/**
 * Methods offered at checkout, in display order. Settings only switch methods off: cod stays Tunisia + TND,
 * transfer stays abroad, and card needs a gateway that may take real money here.
 */
export function paymentMethodsFor(
  order: { country: string; currency: Currency },
  methods: PaymentMethodFlags,
  gatewayReady: boolean,
): PaymentMethod[] {
  const list: PaymentMethod[] = []
  if (methods.online && gatewayReady) list.push("online")
  if (methods.cod && order.country === "TN" && order.currency === "TND") list.push("cod")
  if (methods.transfer && order.country !== "TN") list.push("transfer")
  return list
}

/** French message when a save would leave Tunisia (TND) or abroad (EUR) without any way to pay. */
export function validatePaymentSettings(settings: PaymentSettings, gatewayReady: boolean): string | null {
  if (paymentMethodsFor({ country: "TN", currency: "TND" }, settings.methods, gatewayReady).length === 0)
    return "Au moins un moyen de paiement doit rester actif pour la Tunisie."
  if (paymentMethodsFor({ country: "FR", currency: "EUR" }, settings.methods, gatewayReady).length === 0)
    return "Au moins un moyen de paiement doit rester actif pour l'étranger."
  return null
}
export const requestStatusSchema = z.enum(["new", "contacted", "done", "declined"])

export const loginSchema = z.object({ email: z.email(), password: z.string().min(1).max(200) })

/** Both prices live on the product, so every price is a pair. */
export const pricesSchema = z.object({ TND: z.number().int().nonnegative(), EUR: z.number().int().nonnegative() })

export const categorySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: localizedSchema,
  description: localizedSchema.nullable(),
  image: z.string().nullable(),
  visible: z.boolean(),
  position: z.number().int(),
  productCount: z.number().int(),
})

export const productImageSchema = z.object({ id: z.string(), image: z.string(), alt: z.string().nullable() })

export const productVariantSchema = z.object({
  id: z.string(),
  label: localizedSchema,
  prices: pricesSchema,
  stock: z.number().int(),
})
export type ProductVariant = z.infer<typeof productVariantSchema>

export const productSchema = z.object({
  id: z.string(),
  ref: z.string(),
  slug: z.string(),
  category: z.object({ id: z.string(), slug: z.string(), name: localizedSchema }),
  title: localizedSchema,
  description: localizedSchema.nullable(),
  material: localizedSchema.nullable(),
  technique: localizedSchema.nullable(),
  dimensions: z.string().nullable(),
  /** Packed size and weight, used by the shipping estimate. */
  weightGrams: z.number().int(),
  lengthCm: z.number().int(),
  widthCm: z.number().int(),
  heightCm: z.number().int(),
  /** With variants: the lowest variant price ("from") and the total stock of all variants. */
  prices: pricesSchema,
  stock: z.number().int(),
  unique: z.boolean(),
  quoteOnly: z.boolean(),
  featured: z.boolean(),
  status: productStatusSchema,
  images: z.array(productImageSchema),
  variants: z.array(productVariantSchema),
})
export type Product = z.infer<typeof productSchema>
export type Category = z.infer<typeof categorySchema>

export const productQuerySchema = z.object({
  category: z.string().optional(),
  q: z.string().trim().max(80).optional(),
  sort: z.enum(["featured", "price-asc", "price-desc", "newest"]).default("featured"),
  currency: currencySchema.default("TND"),
  featured: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(60),
})

export const locationSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: localizedSchema.nullable(),
  address: z.string(),
  city: z.string(),
  country: z.string(),
  phone: z.string().nullable(),
  hours: localizedSchema.nullable(),
  mapUrl: z.string().nullable(),
  image: z.string().nullable(),
  visible: z.boolean(),
  position: z.number().int(),
})

export const shippingZoneSchema = z.object({
  id: z.string().min(1).max(30),
  name: z.string().trim().min(1).max(60),
  /** ISO country codes, or "*" for every other country. */
  countries: z.array(z.string().min(1).max(2)).min(1),
  /** Kilos covered by `base`. */
  baseKg: z.number().positive().max(100),
  base: pricesSchema,
  /** Added per extra started kilo. */
  extraPerKg: pricesSchema,
  handling: pricesSchema,
  /** Carrier fuel surcharge on base + extra kilos, e.g. 12 for DHL Express, 0 for a domestic courier. */
  fuelPct: z.number().min(0).max(100),
  /** Cart subtotal from which delivery is free in this zone, per currency. null = never free. */
  freeOver: pricesSchema.nullable().default(null),
})

export const shippingRatesSchema = z.object({
  zones: z.array(shippingZoneSchema).min(1).max(12),
  volumetricDivisor: z.number().int().min(1000).max(10000),
  packagingPct: z.number().min(0).max(200),
  packagingGrams: z.number().int().min(0).max(5000),
  maxKg: z.number().positive().max(200),
  maxSideCm: z.number().positive().max(400),
})
export type ShippingRates = z.infer<typeof shippingRatesSchema>

export const bankDetailsSchema = z.object({
  holder: z.string().trim().max(120),
  bank: z.string().trim().max(120),
  iban: z.string().trim().max(60),
  bic: z.string().trim().max(20),
  rib: z.string().trim().max(30),
})
export type BankDetails = z.infer<typeof bankDetailsSchema>

/** What the old settings stored while the account was not filled in; it never counts as a real account. */
export const UNFILLED_BANK_TEXT = "À compléter"

export const shopProfileSchema = z.object({
  legalName: z.string().nullable(),
  displayName: z.string().nullable(),
  legalForm: z.string().nullable(),
  taxId: z.string().nullable(),
  registryNumber: z.string().nullable(),
  address: z.string().nullable(),
  postalCode: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string(),
  phones: z.array(z.string()),
  email: z.string().nullable(),
  notifyEmail: z.string().nullable(),
  bankHolder: z.string().nullable(),
  bankName: z.string().nullable(),
  bankRib: z.string().nullable(),
  bankIban: z.string().nullable(),
  bankBic: z.string().nullable(),
  invoiceNote: localizedSchema.nullable(),
  shippingConfirmedAt: z.string().nullable(),
  skippedSteps: z.array(z.string()),
  onboardedAt: z.string().nullable(),
  updatedAt: z.string(),
})
export type ShopProfile = z.infer<typeof shopProfileSchema>

const compact = (s: string) => s.replace(/\s+/g, "")
const profileText = (max: number) => z.string().trim().max(max).nullable().optional()
const profileCode = (pattern: RegExp, upper = false) =>
  z
    .string()
    .transform((s) => (upper ? compact(s).toUpperCase() : compact(s)))
    .pipe(z.string().regex(pattern))
    .nullable()
    .optional()

/** ISO 13616 check: move the first four characters to the end, letters become 10..35, the number mod 97 must be 1. */
export function ibanChecksumOk(iban: string): boolean {
  const moved = iban.slice(4) + iban.slice(0, 4)
  let remainder = 0
  for (const char of moved) {
    const digits = String(Number.parseInt(char, 36))
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder === 1
}

/** Editable fields only, each optional so the onboarding can save one step at a time. */
export const shopProfileInputSchema = z.object({
  legalName: profileText(120),
  displayName: profileText(120),
  legalForm: profileText(120),
  taxId: profileText(40),
  registryNumber: profileText(40),
  address: profileText(300),
  postalCode: profileText(20),
  city: profileText(120),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  phones: z.array(z.string().trim().min(6).max(30)).max(4).optional(),
  email: z.email().max(200).nullable().optional(),
  notifyEmail: z.email().max(200).nullable().optional(),
  bankHolder: profileText(120),
  bankName: profileText(120),
  bankRib: profileCode(/^\d{20}$/),
  bankIban: z
    .string()
    .transform((value) => compact(value).toUpperCase())
    .pipe(
      z
        .string()
        .regex(/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/)
        .refine(ibanChecksumOk),
    )
    .nullable()
    .optional(),
  bankBic: profileCode(/^[A-Z0-9]{8}([A-Z0-9]{3})?$/, true),
  invoiceNote: localizedSchema.nullable().optional(),
})
export type ShopProfileInput = z.infer<typeof shopProfileInputSchema>

/**
 * What the storefront may read. The matricule fiscal is public (legal notice); registry number,
 * notification email, bank account and onboarding state never are.
 */
export const publicShopProfileSchema = shopProfileSchema.pick({
  displayName: true,
  legalName: true,
  legalForm: true,
  taxId: true,
  address: true,
  postalCode: true,
  city: true,
  country: true,
  phones: true,
  email: true,
})
export type PublicShopProfile = z.infer<typeof publicShopProfileSchema>

type ProfileBank = Pick<ShopProfile, "bankHolder" | "bankName" | "bankIban" | "bankRib" | "bankBic">

/** The account to show customers, or null while it is incomplete or still the old placeholder. */
export function bankFromProfile(profile: ProfileBank): BankDetails | null {
  const text = (v: string | null) => v?.trim() ?? ""
  const holder = text(profile.bankHolder)
  const bank = text(profile.bankName)
  const iban = text(profile.bankIban)
  const rib = text(profile.bankRib)
  const bic = text(profile.bankBic)
  if ([holder, bank, iban, rib, bic].includes(UNFILLED_BANK_TEXT)) return null
  if (!holder || !bank || !(iban || rib)) return null
  return { holder, bank, iban, rib, bic }
}

export const SETUP_REQUIRED_STEPS = ["owner", "profile", "bank", "shipping"] as const
export const SETUP_OPTIONAL_STEPS = ["konnect", "aramex", "payoneer", "groq", "emailDomain"] as const
export const setupStepIdSchema = z.enum([...SETUP_REQUIRED_STEPS, ...SETUP_OPTIONAL_STEPS])
export type SetupStepId = z.infer<typeof setupStepIdSchema>
export type OptionalSetupStepId = (typeof SETUP_OPTIONAL_STEPS)[number]

export const setupStepSchema = z.object({
  id: setupStepIdSchema,
  required: z.boolean(),
  done: z.boolean(),
  skipped: z.boolean(),
  /** Field names still empty, for the UI hint. */
  missing: z.array(z.string()),
})
export type SetupStep = z.infer<typeof setupStepSchema>

export const setupStatusSchema = z.object({
  steps: z.array(setupStepSchema),
  requiredDone: z.boolean(),
  onboarded: z.boolean(),
  /** Required steps not done plus optional ones neither done nor skipped: the badge number. */
  remaining: z.number().int(),
  total: z.number().int(),
  done: z.number().int(),
})
export type SetupStatus = z.infer<typeof setupStatusSchema>

export const studioSettingsSchema = z.object({
  /** Owned by shop_profile: the dashboard form still sends it and the update copies it into the profile. */
  contactEmail: z.string().optional(),
  /** Owned by shop_profile: the dashboard form still sends it and the update copies it into the profile. */
  phones: z.array(z.string()).optional(),
  whatsapp: z.string().nullable(),
  instagram: z.string().nullable(),
  shippingRates: shippingRatesSchema,
  /** Shown at checkout, e.g. "Pièces uniques expédiées sous 7 jours". */
  shippingNote: localizedSchema.nullable(),
})
export type StudioSettings = z.infer<typeof studioSettingsSchema>

/** What the storefront may read: contact from the shop profile, no bank account, plus the payment methods in effect (after the gateway check). */
export const publicSettingsSchema = studioSettingsSchema.omit({ contactEmail: true, phones: true }).extend({
  contactEmail: z.string(),
  phones: z.array(z.string()),
  onlinePayments: z.boolean(),
  paymentMethods: paymentMethodFlagsSchema,
  profile: publicShopProfileSchema,
})
export type PublicSettings = z.infer<typeof publicSettingsSchema>

export const cartItemSchema = z.object({
  productId: z.string(),
  variantId: z.string().optional(),
  quantity: z.number().int().min(1).max(20),
})

export const orderInputSchema = z.object({
  items: z.array(cartItemSchema).min(1).max(30),
  currency: currencySchema,
  locale: localeSchema.default("fr"),
  /** Defaults to the first method available for the country. */
  paymentMethod: paymentMethodSchema.optional(),
  customerName: z.string().trim().min(2).max(120),
  email: z.email().max(200),
  phone: z.string().trim().min(6).max(30),
  /** ISO country code from SHIPPING_COUNTRIES. */
  country: z.enum(SHIPPING_COUNTRIES),
  city: z.string().trim().min(1).max(80),
  address: z.string().trim().min(3).max(300),
  postalCode: z.string().trim().max(20).optional(),
  note: z.string().trim().max(500).optional(),
})
export type OrderInput = z.infer<typeof orderInputSchema>

export const orderItemSchema = z.object({
  ref: z.string(),
  title: z.string(),
  unitMinor: z.number().int(),
  quantity: z.number().int(),
})

export const orderSchema = z.object({
  number: z.string(),
  status: orderStatusSchema,
  paymentMethod: paymentMethodSchema,
  currency: currencySchema,
  subtotalMinor: z.number().int(),
  shippingMinor: z.number().int(),
  totalMinor: z.number().int(),
  items: z.array(orderItemSchema),
  createdAt: z.string(),
  paidAt: z.string().nullable(),
})

/** What the customer sees on their order page: the bank account only while a transfer is still expected. */
export const publicOrderSchema = orderSchema.extend({ bank: bankDetailsSchema.nullable() })

export const manualPaymentMethodSchema = z.enum(["transfer", "payoneer", "cash", "other"])
export type ManualPaymentMethod = z.infer<typeof manualPaymentMethodSchema>

export const orderAuditSchema = z.object({
  id: z.string(),
  action: z.string(),
  fromStatus: orderStatusSchema,
  toStatus: orderStatusSchema,
  method: z.string().nullable(),
  reference: z.string().nullable(),
  note: z.string().nullable(),
  adminName: z.string().nullable(),
  createdAt: z.string(),
})

export const adminOrderSchema = orderSchema.extend({
  id: z.string(),
  customerName: z.string(),
  email: z.string(),
  phone: z.string(),
  country: z.string(),
  city: z.string(),
  address: z.string(),
  postalCode: z.string().nullable(),
  note: z.string().nullable(),
  locale: z.string(),
  paymentProvider: z.string().nullable(),
  paymentRef: z.string().nullable(),
})

/** Dates are studio days (Africa/Tunis), `YYYY-MM-DD`, both ends included. Filters on the payment date, like the overview. */
export const orderExportInputSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: currencySchema,
  status: z.enum(["paid", "fulfilled"]).optional(),
})

export const checkoutSchema = z.object({ number: z.string(), token: z.string(), payUrl: z.string() })

export const customRequestInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(200),
  phone: z.string().trim().max(30).optional(),
  country: z.string().trim().max(80).optional(),
  description: z.string().trim().min(10).max(3000),
  dimensions: z.string().trim().max(200).optional(),
  budget: z.string().trim().max(100).optional(),
  references: z.string().trim().max(1000).optional(),
  /** `s3:` keys returned by `requests.uploadUrl`, after the browser uploaded them. */
  images: z.array(z.string().max(300)).max(3).default([]),
  locale: localeSchema.default("fr"),
})

export const REQUEST_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
export const REQUEST_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const requestUploadInputSchema = z.object({
  contentType: z.enum(REQUEST_IMAGE_TYPES),
  size: z.number().int().min(1).max(REQUEST_IMAGE_MAX_BYTES),
})

export const customRequestSchema = customRequestInputSchema.extend({
  id: z.string(),
  status: requestStatusSchema,
  adminNote: z.string().nullable(),
  createdAt: z.string(),
})

export const productVariantInputSchema = z.object({
  /** Set when editing an existing variant, so orders that hold its stock keep pointing at it. */
  id: z.string().optional(),
  label: localizedInput(80),
  priceTnd: z.number().int().nonnegative(),
  priceEur: z.number().int().nonnegative(),
  stock: z.number().int().min(0).max(9999),
})

export const productInputSchema = z.object({
  ref: z.string().trim().min(1).max(20),
  categoryId: z.string(),
  title: localizedInput(120),
  description: localizedInput(3000).nullable().optional(),
  material: localizedInput(200).nullable().optional(),
  technique: localizedInput(200).nullable().optional(),
  dimensions: z.string().trim().max(120).nullable().optional(),
  weightGrams: z.number().int().min(1).max(500_000),
  lengthCm: z.number().int().min(1).max(1000),
  widthCm: z.number().int().min(1).max(1000),
  heightCm: z.number().int().min(1).max(1000),
  priceTnd: z.number().int().nonnegative(),
  priceEur: z.number().int().nonnegative(),
  stock: z.number().int().min(0).max(9999),
  unique: z.boolean().default(false),
  quoteOnly: z.boolean().default(false),
  featured: z.boolean().default(false),
  status: productStatusSchema.default("draft"),
  images: z
    .array(z.object({ image: z.string(), alt: z.string().nullable().optional() }))
    .max(12)
    .default([]),
  variants: z.array(productVariantInputSchema).max(8).default([]),
})
export type ProductInput = z.infer<typeof productInputSchema>

export const categoryInputSchema = z.object({
  name: localizedInput(80),
  description: localizedInput(500).nullable().optional(),
  image: z.string().nullable().optional(),
  visible: z.boolean().default(true),
})

export const locationInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: localizedInput(1000).nullable().optional(),
  address: z.string().trim().min(1).max(300),
  city: z.string().trim().min(1).max(80),
  country: z.string().trim().min(1).max(80).default("Tunisie"),
  phone: z.string().trim().max(30).nullable().optional(),
  hours: localizedInput(300).nullable().optional(),
  mapUrl: z.url().nullable().optional(),
  image: z.string().nullable().optional(),
  visible: z.boolean().default(true),
})

export const orderListQuerySchema = z.object({
  status: orderStatusSchema.optional(),
  q: z.string().trim().max(80).optional(),
  limit: z.number().int().min(1).max(1000).default(100),
})

export const statsRangeSchema = z.object({ days: z.number().int().min(1).max(365).default(30) })

export const statsSchema = z.object({
  days: z.number().int(),
  /** Paid revenue per currency, in minor units. The two are never added together. */
  revenue: pricesSchema,
  paidOrders: z.number().int(),
  pendingOrders: z.number().int(),
  averageOrder: pricesSchema,
  newRequests: z.number().int(),
  byDay: z.array(z.object({ day: z.string(), TND: z.number().int(), EUR: z.number().int(), orders: z.number().int() })),
  topProducts: z.array(z.object({ ref: z.string(), title: z.string(), quantity: z.number().int() })),
  byCountry: z.array(z.object({ country: z.string(), orders: z.number().int() })),
  lowStock: z.array(z.object({ id: z.string(), ref: z.string(), title: z.string(), stock: z.number().int() })),
  /** Mails that could not be sent and are still waiting for the owner. */
  failedMails: z.number().int(),
})

export const mailLogItemSchema = z.object({
  id: z.string().uuid(),
  kind: z.string(),
  to: z.string(),
  subject: z.string(),
  error: z.string().nullable(),
  attempts: z.number().int(),
  createdAt: z.string(),
  orderNumber: z.string().nullable(),
})
export type MailLogItem = z.infer<typeof mailLogItemSchema>

export const emailDomainSchema = z.object({
  state: z.enum(["verified", "pending", "failed", "not_found", "restricted_key", "not_configured", "unavailable"]),
  domain: z.string().nullable(),
  from: z.string(),
  records: z.array(
    z.object({
      purpose: z.string(),
      type: z.string(),
      name: z.string(),
      value: z.string(),
      priority: z.number().int().nullable(),
      status: z.string(),
    }),
  ),
  /** Suggested, never required. */
  dmarc: z.object({ name: z.string(), value: z.string() }).nullable(),
})
export type EmailDomain = z.infer<typeof emailDomainSchema>

/** What the studio's plan stores: dashboard images and customer photos together. */
export const STORAGE_QUOTA_BYTES = 2_500_000_000
/** The dashboard shrinks every image first, so anything past this is not a normal photo. */
export const UPLOAD_MAX_BYTES = 12 * 1024 * 1024

export const uploadSignSchema = z.object({
  folder: z.enum(["products", "categories", "locations"]),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/avif"]),
  size: z.number().int().min(1).max(UPLOAD_MAX_BYTES),
})
export const storageUsageSchema = z.object({
  usedBytes: z.number().int(),
  quotaBytes: z.number().int(),
  files: z.number().int(),
})
export const uploadTargetSchema = z.object({ uploadUrl: z.string(), image: z.string(), publicUrl: z.string() })

export const shippingQuoteInputSchema = z.object({
  items: z.array(cartItemSchema).min(1).max(30),
  country: z.enum(SHIPPING_COUNTRIES),
  currency: currencySchema,
})

export const shippingQuoteSchema = z.object({
  available: z.boolean(),
  reason: z.enum(["too-heavy", "too-long", "no-zone"]).optional(),
  zoneName: z.string().nullable(),
  chargeableKg: z.number(),
  amountMinor: z.number().int(),
  freeApplied: z.boolean(),
  /** The zone's free-delivery threshold in the quote currency, null when the zone has none. */
  freeOverMinor: z.number().int().nullable(),
  subtotalMinor: z.number().int(),
})

export const mediaSourceSchema = z.enum(["bucket", "bundled", "external"])
export const mediaSchema = z.object({
  id: z.string(),
  key: z.string(),
  /** What `imageSrc()` accepts: `s3:<key>` for a bucket file, the path or URL otherwise. */
  src: z.string(),
  filename: z.string(),
  originalName: z.string().nullable(),
  mime: z.string(),
  bytes: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  alt: localizedSchema.nullable(),
  tags: z.array(z.string()),
  source: mediaSourceSchema,
  keep: z.boolean(),
  usageCount: z.number().int(),
  unusedSince: z.string().nullable(),
  /** `unusedSince` + 30 days, null when used or pinned. */
  deletesAt: z.string().nullable(),
  createdAt: z.string(),
})
export type Media = z.infer<typeof mediaSchema>
