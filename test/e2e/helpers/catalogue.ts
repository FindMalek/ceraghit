import type { APIRequestContext } from "@playwright/test"
import { type Currency, formatMoney, type Product } from "@workspace/sdk"
import postgres from "postgres"
import { E2E } from "../env"
import type { AppLocale } from "./locale"

export type { Product }

/** Published pieces as the storefront sees them. Specs pick by kind, never by slug. */
export async function catalogue(request: APIRequestContext): Promise<Product[]> {
  const res = await request.get(`${E2E.apiUrl}/v1/products`)
  if (!res.ok()) throw new Error(`products ${res.status()}`)
  return (await res.json()) as Product[]
}

export interface Kinds {
  /** Plain piece with stock for at least three. */
  stocked: Product
  /** Has variants, all in stock (the demo seed has no sold out variant yet). */
  variants: Product
  unique: Product
  quoteOnly: Product
  /** At least three photos. */
  gallery: Product
}

export function pickKinds(all: Product[]): Kinds {
  const plain = all.filter((p) => !p.unique && !p.quoteOnly && p.variants.length === 0)
  const find = (name: string, product: Product | undefined): Product => {
    if (!product) throw new Error(`the e2e seed has no ${name} piece`)
    return product
  }
  return {
    stocked: find(
      "stocked",
      plain.find((p) => p.stock >= 3),
    ),
    variants: find(
      "variants",
      all.find((p) => p.variants.length >= 2 && p.variants.every((v) => v.stock > 0)),
    ),
    unique: find(
      "unique",
      all.find((p) => p.unique && p.stock > 0 && !p.quoteOnly),
    ),
    quoteOnly: find(
      "quote only",
      all.find((p) => p.quoteOnly),
    ),
    gallery: find(
      "gallery",
      all.find((p) => p.images.length >= 3 && !p.quoteOnly),
    ),
  }
}

export function price(minor: number, currency: Currency, locale: AppLocale): string {
  return formatMoney(minor, currency, locale)
}

export async function dbQuery<T extends object>(query: string, params: string[]): Promise<T[]> {
  const sql = postgres(E2E.databaseUrl, { max: 1 })
  try {
    return (await sql.unsafe(query, params)) as unknown as T[]
  } finally {
    await sql.end()
  }
}
