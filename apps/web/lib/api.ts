import "server-only"
import { unstable_cache } from "next/cache"
import { createServerClient } from "@workspace/orpc/server"
import type { Category, Product, PublicSettings, PublicSiteImages } from "@workspace/sdk"
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

// Pages are force-dynamic (CSP nonce) and these reads are POSTs the CDN cannot cache, so share them for 2 minutes.
// Errors are not cached: the fallback is applied outside, in `soft`.
const TTL = 120

const cachedCategories = unstable_cache(() => api.public.catalog.categories(), ["api:categories"], { revalidate: TTL })
const cachedProducts = unstable_cache((query: ProductQuery) => api.public.catalog.products(query), ["api:products"], {
  revalidate: TTL,
})
const cachedLocations = unstable_cache(() => api.public.catalog.locations(), ["api:locations"], { revalidate: TTL })
const cachedSettings = unstable_cache(() => api.public.catalog.settings(), ["api:settings"], { revalidate: TTL })
const cachedSiteImages = unstable_cache(() => api.public.site.images(), ["api:site-images"], { revalidate: TTL })

export const getCategories = (): Promise<Category[]> => soft(cachedCategories(), [])
export const getProducts = (query: ProductQuery): Promise<Product[]> => soft(cachedProducts(query), [])
export const getLocations = () => soft(cachedLocations(), [])
export const getSettings = (): Promise<PublicSettings> => soft(cachedSettings(), FALLBACK_SETTINGS)

export const getSiteImages = (): Promise<Partial<PublicSiteImages>> =>
  soft<Partial<PublicSiteImages>>(cachedSiteImages(), {})

export async function getProduct(slug: string): Promise<Product | null> {
  try {
    return await api.public.catalog.product({ slug })
  } catch {
    return null
  }
}
