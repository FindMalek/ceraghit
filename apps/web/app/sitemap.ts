import type { MetadataRoute } from "next"
import { getCategories, getProducts } from "@/lib/api"
import { ENABLED_LOCALES } from "@/lib/locales"
import { SITE } from "@/lib/site"

export const dynamic = "force-dynamic"

const STATIC_PATHS = ["", "/shop", "/atelier", "/custom"]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, products] = await Promise.all([
    getCategories(),
    getProducts({ sort: "newest", currency: "TND", limit: 100 }),
  ])
  const paths = [
    ...STATIC_PATHS,
    ...categories.map((c) => `/shop/${c.slug}`),
    ...products.map((p) => `/product/${p.slug}`),
  ]
  return ENABLED_LOCALES.flatMap((locale) =>
    paths.map((path) => ({ url: `${SITE.url}${locale === "fr" ? "" : `/${locale}`}${path}` || SITE.url })),
  )
}
