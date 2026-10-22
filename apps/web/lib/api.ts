import "server-only"
import { createServerClient } from "@workspace/orpc/server"
import type { Category, Product, StudioSettings } from "@workspace/sdk"
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

export const getCategories = (): Promise<Category[]> => soft(api.public.catalog.categories(), [])
export const getProducts = (query: ProductQuery): Promise<Product[]> => soft(api.public.catalog.products(query), [])
export const getLocations = () => soft(api.public.catalog.locations(), [])
export const getSettings = (): Promise<StudioSettings> => soft(api.public.catalog.settings(), FALLBACK_SETTINGS)

export async function getProduct(slug: string): Promise<Product | null> {
  try {
    return await api.public.catalog.product({ slug })
  } catch {
    return null
  }
}
