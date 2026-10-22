import { type Currency, fromMinor, type Product, pick, type StudioSettings } from "@workspace/sdk"
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

export function organizationJsonLd(settings: StudioSettings): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "Ceraghit Creation",
    url: SITE.url,
    logo: absoluteUrl("/logo.webp"),
    image: absoluteUrl("/logo.webp"),
    founder: { "@type": "Person", name: SITE.artist },
    ...(settings.phones[0] ? { telephone: settings.phones[0] } : {}),
    ...(settings.contactEmail ? { email: settings.contactEmail } : {}),
    ...(settings.instagram ? { sameAs: [instagramUrl(settings.instagram)] } : {}),
  }
}
