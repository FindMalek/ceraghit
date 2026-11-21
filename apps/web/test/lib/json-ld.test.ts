import { expect, test } from "bun:test"
import { DEFAULT_SHIPPING_RATES, type Product, type PublicSettings } from "@workspace/sdk"
import { organizationJsonLd, productJsonLd } from "../../lib/json-ld"
import { publisherLines } from "../../lib/legal"

const product: Product = {
  id: "p1",
  ref: "0200",
  slug: "lampe-votive-0200",
  category: { id: "c1", slug: "lampe-votive", name: { fr: "Lampe votive" } },
  title: { fr: "Lampe votive" },
  description: null,
  material: { fr: "Céramique" },
  technique: { fr: "Modelé à la main" },
  dimensions: "20 cm",
  weightGrams: 1500,
  lengthCm: 24,
  widthCm: 24,
  heightCm: 24,
  prices: { TND: 102_500, EUR: 3_000 },
  stock: 2,
  unique: false,
  quoteOnly: false,
  featured: false,
  status: "published",
  images: [
    {
      id: "i1",
      mediaId: null,
      image: "/catalogue/0200-1.webp",
      alt: null,
      altOverride: null,
      isMain: true,
      width: null,
      height: null,
    },
  ],
  variants: [],
}

test("offers carry the price in major units of the visitor's currency", () => {
  expect(productJsonLd(product, "TND", "fr").offers).toMatchObject({ price: 102.5, priceCurrency: "TND" })
  expect(productJsonLd(product, "EUR", "fr").offers).toMatchObject({ price: 30, priceCurrency: "EUR" })
})

test("a sold out piece is OutOfStock and images are absolute", () => {
  const data = productJsonLd({ ...product, stock: 0 }, "EUR", "fr")
  expect(data.offers).toMatchObject({ availability: "https://schema.org/OutOfStock" })
  expect(data.sku).toBe("0200")
  expect((data.image as string[])[0]).toStartWith("http")
})

test("a piece with variants publishes the price range and one offer per variant", () => {
  const withVariants: Product = {
    ...product,
    variants: [
      { id: "v1", label: { fr: "Émaillée" }, prices: { TND: 100_000, EUR: 3_000 }, stock: 2 },
      { id: "v2", label: { fr: "Non émaillée" }, prices: { TND: 85_000, EUR: 2_500 }, stock: 0 },
    ],
  }
  const offers = productJsonLd(withVariants, "EUR", "fr").offers as {
    lowPrice: number
    highPrice: number
    offers: { availability: string }[]
  }
  expect(offers).toMatchObject({ "@type": "AggregateOffer", lowPrice: 25, highPrice: 30, offerCount: 2 })
  expect(offers.offers[1]?.availability).toBe("https://schema.org/OutOfStock")
})

const settings: PublicSettings = {
  contactEmail: "atelier@example.com",
  phones: ["+216 70 000 000"],
  whatsapp: null,
  instagram: null,
  shippingRates: DEFAULT_SHIPPING_RATES,
  shippingNote: null,
  onlinePayments: false,
  paymentMethods: { online: false, cod: true, transfer: true, payoneer: false },
  profile: {
    displayName: "Ceraghit",
    legalName: "Ceraghit Creation SARL",
    legalForm: "SARL",
    taxId: "1234567/A/M/000",
    address: "12 rue des Potiers",
    postalCode: "2070",
    city: "La Marsa",
    country: "TN",
    phones: ["+216 70 000 000"],
    email: "atelier@example.com",
  },
}

test("the organization carries the owner's address, and no address key without one", () => {
  expect(organizationJsonLd(settings)).toMatchObject({
    name: "Ceraghit",
    legalName: "Ceraghit Creation SARL",
    address: {
      "@type": "PostalAddress",
      streetAddress: "12 rue des Potiers",
      postalCode: "2070",
      addressLocality: "La Marsa",
      addressCountry: "TN",
    },
  })
  const bare = organizationJsonLd({ ...settings, profile: { ...settings.profile, address: null, city: null } })
  expect("address" in bare).toBe(false)
})

test("the organization logo follows the logo slot and defaults to the bundled one", () => {
  expect(organizationJsonLd(settings, "/api/files/logo-new.webp")).toMatchObject({
    logo: expect.stringMatching(/\/api\/files\/logo-new\.webp$/),
  })
  expect(organizationJsonLd(settings)).toMatchObject({ logo: expect.stringMatching(/\/logo\.webp$/) })
})

test("the legal notice lists only what the owner filled in", () => {
  expect(publisherLines(settings.profile).map((l) => l.key)).toEqual(["company", "form", "address", "taxId"])
  const sparse = publisherLines({
    ...settings.profile,
    legalName: null,
    legalForm: null,
    address: null,
    postalCode: null,
    city: null,
    taxId: " ",
  })
  expect(sparse).toEqual([{ key: "company", value: "Ceraghit" }])
})
