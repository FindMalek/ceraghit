import type { APIRequestContext, TestInfo } from "@playwright/test"
import { E2E } from "../env"
import { setStock } from "./db"

export interface CataloguePiece {
  id: string
  slug: string
  stock: number
  prices: { TND: number; EUR: number }
}

interface ApiPiece extends CataloguePiece {
  unique: boolean
  quoteOnly: boolean
  variants: unknown[]
}

/**
 * A plain piece (no options, not unique, not on quote) picked from the test name, so parallel tests rarely share one,
 * with its stock reset so every test starts from a known count.
 */
export async function pieceFor(request: APIRequestContext, testInfo: TestInfo, stock = 50): Promise<CataloguePiece> {
  const res = await request.get(`${E2E.apiUrl}/v1/products`)
  if (!res.ok()) throw new Error(`products ${res.status()}`)
  const list = ((await res.json()) as ApiPiece[])
    .filter((p) => !p.unique && !p.quoteOnly && p.variants.length === 0 && p.prices.TND > 0)
    .sort((a, b) => a.slug.localeCompare(b.slug))
  const key = `${testInfo.project.name}:${testInfo.title}`
  let hash = 0
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const found = list[hash % list.length]
  if (!found) throw new Error("no plain piece in the demo seed")
  await setStock(found.id, stock)
  return { id: found.id, slug: found.slug, stock, prices: found.prices }
}

/** The cheapest unique piece: the big ones are too bulky to ship online. */
export async function uniquePiece(request: APIRequestContext): Promise<CataloguePiece> {
  const res = await request.get(`${E2E.apiUrl}/v1/products`)
  const list = (await res.json()) as ApiPiece[]
  const found = list
    .filter((p) => p.unique && !p.quoteOnly && p.variants.length === 0)
    .sort((a, b) => a.prices.TND - b.prices.TND)[0]
  if (!found) throw new Error("no unique piece in the demo seed")
  return { id: found.id, slug: found.slug, stock: found.stock, prices: found.prices }
}
