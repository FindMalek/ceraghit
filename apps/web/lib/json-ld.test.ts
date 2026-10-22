import { expect, test } from "bun:test"
import type { Product } from "@workspace/sdk"
import { productJsonLd } from "./json-ld"

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
  images: [{ id: "i1", image: "/catalogue/0200-1.webp", alt: null }],
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
