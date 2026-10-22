import type { MetadataRoute } from "next"
import { getCategories, getProducts } from "@/lib/api"
import { ENABLED_LOCALES } from "@/lib/locales"
import { absoluteUrl, localizedPath } from "@/lib/seo"
import { SITE } from "@/lib/site"

export const dynamic = "force-dynamic"

const STATIC_PATHS = ["/shop", "/atelier", "/custom"]

function entry(path: string, priority: number): MetadataRoute.Sitemap[number] {
  return {
    url: absoluteUrl(localizedPath(ENABLED_LOCALES[0] ?? "fr", path)),
    priority,
    alternates: {
      languages: Object.fromEntries(
        ENABLED_LOCALES.map((locale) => [locale, absoluteUrl(localizedPath(locale, path))]),
      ),
    },
  }
}

/** Only production is indexable. When the api is down the sitemap shrinks to the home page. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!SITE.isProduction) return []
  const [categories, products] = await Promise.all([
    getCategories(),
    getProducts({ sort: "newest", currency: "TND", limit: 100 }),
  ])
  if (categories.length === 0 && products.length === 0) return [entry("", 1)]
  return [
    entry("", 1),
    ...STATIC_PATHS.map((path) => entry(path, 0.8)),
    ...categories.map((c) => entry(`/shop/${c.slug}`, 0.8)),
    ...products.map((p) => entry(`/product/${p.slug}`, 0.6)),
  ]
}
