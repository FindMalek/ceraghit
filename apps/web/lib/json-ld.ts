import {
  type Currency,
  fromMinor,
  type Product,
  type PublicSettings,
  type PublicShopProfile,
  pick,
} from "@workspace/sdk"
import { clean, shopName } from "./profile"
import { absoluteImage, absoluteUrl, localizedPath } from "./seo"
import { SITE } from "./site"

type JsonLd = Record<string, unknown>

/** Price in major units: 75 TND, 34.5 EUR. TND is stored in millimes, EUR in cents. */
export function majorPrice(minor: number, currency: Currency): number {
  return fromMinor(minor, currency)
}

const IN_STOCK = "https://schema.org/InStock"
const OUT_OF_STOCK = "https://schema.org/OutOfStock"

/** One offer for a plain piece; for a piece with variants an aggregate (lowest to highest) with an offer per variant. */
function offersJsonLd(product: Product, currency: Currency, locale: string, url: string): JsonLd {
  const base = { priceCurrency: currency, itemCondition: "https://schema.org/NewCondition", url }
  if (product.variants.length < 2) {
    return {
      "@type": "Offer",
      price: majorPrice(product.prices[currency], currency),
      availability: product.stock > 0 ? IN_STOCK : OUT_OF_STOCK,
      ...base,
    }
  }
  const prices = product.variants.map((v) => v.prices[currency])
  return {
    "@type": "AggregateOffer",
    lowPrice: majorPrice(Math.min(...prices), currency),
    highPrice: majorPrice(Math.max(...prices), currency),
    offerCount: product.variants.length,
    availability: product.stock > 0 ? IN_STOCK : OUT_OF_STOCK,
    priceCurrency: currency,
    offers: product.variants.map((v) => ({
      "@type": "Offer",
      name: pick(v.label, locale),
      price: majorPrice(v.prices[currency], currency),
      availability: v.stock > 0 ? IN_STOCK : OUT_OF_STOCK,
      ...base,
    })),
  }
}

export function productJsonLd(product: Product, currency: Currency, locale: string): JsonLd {
  const name = pick(product.title, locale)
  const url = absoluteUrl(localizedPath(locale, `/product/${product.slug}`))
  const details = [
    pick(product.description, locale),
    pick(product.material, locale),
    pick(product.technique, locale),
    product.dimensions,
  ].filter(Boolean)
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    sku: product.ref,
    description: details.join(". ") || name,
    image: product.images.map((i) => absoluteImage(i.image)),
    brand: { "@type": "Brand", name: SITE.name },
    category: pick(product.category.name, locale),
    url,
    offers: offersJsonLd(product, currency, locale, url),
  }
}

export function breadcrumbJsonLd(crumbs: { name: string; path: string }[], locale: string): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(localizedPath(locale, crumb.path)),
    })),
  }
}

function instagramUrl(value: string): string {
  return /^https?:\/\//.test(value) ? value : `https://www.instagram.com/${value.replace(/^@/, "")}`
}

function postalAddressJsonLd(profile: PublicShopProfile): JsonLd | null {
  const street = clean(profile.address)
  const city = clean(profile.city)
  if (!street || !city) return null
  return {
    "@type": "PostalAddress",
    streetAddress: street,
    ...(clean(profile.postalCode) ? { postalCode: clean(profile.postalCode) } : {}),
    addressLocality: city,
    ...(profile.country ? { addressCountry: profile.country } : {}),
  }
}

export function organizationJsonLd(settings: PublicSettings, logo = "/logo.webp"): JsonLd {
  const { profile } = settings
  const address = postalAddressJsonLd(profile)
  const telephone = profile.phones[0] ?? settings.phones[0]
  const email = profile.email ?? settings.contactEmail
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: shopName(profile),
    ...(clean(profile.legalName) ? { legalName: clean(profile.legalName) } : {}),
    url: SITE.url,
    logo: absoluteImage(logo),
    image: absoluteImage(logo),
    founder: { "@type": "Person", name: SITE.artist },
    ...(address ? { address } : {}),
    ...(telephone ? { telephone } : {}),
    ...(email ? { email } : {}),
    ...(settings.instagram ? { sameAs: [instagramUrl(settings.instagram)] } : {}),
  }
}
