import type { Db } from "@workspace/db"
import type { Category, Product } from "@workspace/sdk"

export type ProductRow = Awaited<ReturnType<typeof findProducts>>[number]

/** Products with their category and ordered images; `where` and `orderBy` come from the caller. */
export function findProducts(db: Db, opts: Parameters<Db["query"]["products"]["findMany"]>[0] = {}) {
  return db.query.products.findMany({
    ...opts,
    with: {
      category: true,
      images: { orderBy: (i, { asc }) => [asc(i.position)] },
      variants: { orderBy: (v, { asc }) => [asc(v.position)] },
    },
  })
}

export function toProduct(row: ProductRow): Product {
  const variants = row.variants.map((v) => ({
    id: v.id,
    label: v.label,
    prices: { TND: v.priceTnd, EUR: v.priceEur },
    stock: v.stock,
  }))
  // With variants the product shows its cheapest price and the stock of all of them.
  const prices = variants.length
    ? { TND: Math.min(...variants.map((v) => v.prices.TND)), EUR: Math.min(...variants.map((v) => v.prices.EUR)) }
    : { TND: row.priceTnd, EUR: row.priceEur }
  const stock = variants.length ? variants.reduce((sum, v) => sum + v.stock, 0) : row.stock
  return {
    id: row.id,
    ref: row.ref,
    slug: row.slug,
    category: { id: row.category.id, slug: row.category.slug, name: row.category.name },
    title: row.title,
    description: row.description,
    material: row.material,
    technique: row.technique,
    dimensions: row.dimensions,
    weightGrams: row.weightGrams,
    lengthCm: row.lengthCm,
    widthCm: row.widthCm,
    heightCm: row.heightCm,
    prices,
    stock,
    unique: row.unique,
    quoteOnly: row.quoteOnly,
    featured: row.featured,
    status: row.status,
    images: row.images.map((i) => ({ id: i.id, image: i.image, alt: i.alt })),
    variants,
  }
}

export function toCategory(row: {
  id: string
  slug: string
  name: Category["name"]
  description: Category["description"]
  image: string | null
  visible: boolean
  position: number
  productCount: number
}): Category {
  return { ...row }
}
