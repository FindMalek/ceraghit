import type { Db } from "@workspace/db"
import type { Category, Product } from "@workspace/sdk"

export type ProductRow = Awaited<ReturnType<typeof findProducts>>[number]

/** Products with their category and ordered images; `where` and `orderBy` come from the caller. */
export function findProducts(db: Db, opts: Parameters<Db["query"]["products"]["findMany"]>[0] = {}) {
  return db.query.products.findMany({
    ...opts,
    with: { category: true, images: { orderBy: (i, { asc }) => [asc(i.position)] } },
  })
}

export function toProduct(row: ProductRow): Product {
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
    prices: { TND: row.priceTnd, EUR: row.priceEur },
    stock: row.stock,
    unique: row.unique,
    quoteOnly: row.quoteOnly,
    featured: row.featured,
    status: row.status,
    images: row.images.map((i) => ({ id: i.id, image: i.image, alt: i.alt })),
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
