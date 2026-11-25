import "server-only"
import { createServerClient } from "@workspace/orpc/server"
import type { Category, Product, PublicSettings, PublicSiteImages } from "@workspace/sdk"
import { unstable_cache } from "next/cache"
import { cache } from "react"
import { CATALOG_TAG } from "./cache-tag"
import { FALLBACK_SETTINGS } from "./settings"

const api = createServerClient()

type ProductQuery = Parameters<typeof api.public.catalog.products>[0]

async function soft<T>(call: Promise<T>, fallback: T): Promise<T> {
  try {
    return await call
  } catch (error) {
    console.error("[api]", error instanceof Error ? error.message : error)
    return fallback
  }
}

// Pages are force-dynamic (CSP nonce) and these reads are POSTs the CDN cannot cache, so share them for 10 minutes.
// Errors are not cached: the fallback is applied outside, in `soft`. The api drops the tag after a write
// (`/api/revalidate`), so owner edits show at once; the TTL covers what it cannot announce (cron, gateway).
const TTL = 600
const OPTIONS = { revalidate: TTL, tags: [CATALOG_TAG] }

const cachedCategories = unstable_cache(() => api.public.catalog.categories(), ["api:categories"], OPTIONS)
const cachedProducts = unstable_cache(
  (query: ProductQuery) => api.public.catalog.products(query),
  ["api:products"],
  OPTIONS,
)
const cachedLocations = unstable_cache(() => api.public.catalog.locations(), ["api:locations"], OPTIONS)
const cachedSettings = unstable_cache(() => api.public.catalog.settings(), ["api:settings"], OPTIONS)
const cachedSiteImages = unstable_cache(() => api.public.site.images(), ["api:site-images"], OPTIONS)

export const getCategories = (): Promise<Category[]> => soft(cachedCategories(), [])
export const getProducts = (query: ProductQuery): Promise<Product[]> => soft(cachedProducts(query), [])
export const getLocations = () => soft(cachedLocations(), [])
export const getSettings = (): Promise<PublicSettings> => soft(cachedSettings(), FALLBACK_SETTINGS)

export const getSiteImages = cache(
  (): Promise<Partial<PublicSiteImages>> => soft<Partial<PublicSiteImages>>(cachedSiteImages(), {}),
)

export const getProduct = cache(async (slug: string): Promise<Product | null> => {
  try {
    return await api.public.catalog.product({ slug })
  } catch {
    return null
  }
})
