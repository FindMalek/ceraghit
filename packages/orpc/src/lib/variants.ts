import { type Db, productVariants } from "@workspace/db"
import type { ProductInput } from "@workspace/sdk"
import { eq } from "drizzle-orm"

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

/**
 * Makes the product's variants match the input: known ids are updated in place (orders may be holding their stock),
 * new ones inserted, missing ones deleted. Returns the product-level "from" price and total stock, or null when the
 * product has no variants and keeps its own price and stock.
 */
export async function syncVariants(
  tx: Tx,
  productId: string,
  variants: ProductInput["variants"],
): Promise<{ priceTnd: number; priceEur: number; stock: number } | null> {
  const existing = await tx
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(eq(productVariants.productId, productId))
  const known = new Set(existing.map((v) => v.id))
  const keep = new Set(variants.flatMap((v) => (v.id && known.has(v.id) ? [v.id] : [])))
  for (const { id } of existing) {
    if (!keep.has(id)) await tx.delete(productVariants).where(eq(productVariants.id, id))
  }
  for (const [position, v] of variants.entries()) {
    const values = { label: v.label, priceTnd: v.priceTnd, priceEur: v.priceEur, stock: v.stock, position }
    if (v.id && known.has(v.id)) await tx.update(productVariants).set(values).where(eq(productVariants.id, v.id))
    else await tx.insert(productVariants).values({ ...values, productId })
  }
  if (!variants.length) return null
  return {
    priceTnd: Math.min(...variants.map((v) => v.priceTnd)),
    priceEur: Math.min(...variants.map((v) => v.priceEur)),
    stock: variants.reduce((sum, v) => sum + v.stock, 0),
  }
}
