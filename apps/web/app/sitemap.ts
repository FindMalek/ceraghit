import type { MetadataRoute } from "next"
import { getCategories, getProducts } from "@/lib/api"
import { LEGAL_DOCS } from "@/lib/legal"
import { ENABLED_LOCALES } from "@/lib/locales"
import { SITE } from "@/lib/site"

export const dynamic = "force-dynamic"

const STATIC_PATHS = ["", "/shop", "/atelier", "/custom", ...LEGAL_DOCS.map((doc) => `/legal/${doc}`)]

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
