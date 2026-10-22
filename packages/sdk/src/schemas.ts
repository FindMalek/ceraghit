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
  prices: pricesSchema,
  stock: z.number().int(),
  unique: z.boolean(),
  quoteOnly: z.boolean(),
  featured: z.boolean(),
  status: productStatusSchema,
  images: z.array(productImageSchema),
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

export const studioSettingsSchema = z.object({
  contactEmail: z.string(),
  phones: z.array(z.string()),
  whatsapp: z.string().nullable(),
  instagram: z.string().nullable(),
  shippingRates: shippingRatesSchema,
  /** Shown at checkout, e.g. "Pièces uniques expédiées sous 7 jours". */
  shippingNote: localizedSchema.nullable(),
})
export type StudioSettings = z.infer<typeof studioSettingsSchema>

export const orderInputSchema = z.object({
  items: z
    .array(z.object({ productId: z.string(), quantity: z.number().int().min(1).max(20) }))
    .min(1)
    .max(30),
  currency: currencySchema,
  locale: localeSchema.default("fr"),
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
  currency: currencySchema,
  subtotalMinor: z.number().int(),
  shippingMinor: z.number().int(),
  totalMinor: z.number().int(),
  items: z.array(orderItemSchema),
  createdAt: z.string(),
  paidAt: z.string().nullable(),
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
  locale: localeSchema.default("fr"),
})

export const customRequestSchema = customRequestInputSchema.extend({
  id: z.string(),
  status: requestStatusSchema,
  adminNote: z.string().nullable(),
  createdAt: z.string(),
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
  limit: z.number().int().min(1).max(200).default(100),
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
})

export const uploadSignSchema = z.object({
  folder: z.enum(["products", "categories", "locations"]),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/avif"]),
})
export const uploadTargetSchema = z.object({ uploadUrl: z.string(), image: z.string(), publicUrl: z.string() })

export const shippingQuoteInputSchema = z.object({
  items: z
    .array(z.object({ productId: z.string(), quantity: z.number().int().min(1).max(20) }))
    .min(1)
    .max(30),
  country: z.enum(SHIPPING_COUNTRIES),
  currency: currencySchema,
})

export const shippingQuoteSchema = z.object({
  available: z.boolean(),
  reason: z.enum(["too-heavy", "too-long", "no-zone"]).optional(),
  zoneName: z.string().nullable(),
  chargeableKg: z.number(),
  amountMinor: z.number().int(),
})
