import { type Db, type locations, media } from "@workspace/db"
import { type Category, type Location, mediaSrc, type Product } from "@workspace/sdk"

export type ProductRow = Awaited<ReturnType<typeof findProducts>>[number]

/** Products with their category and ordered images; `where` and `orderBy` come from the caller. */
export function findProducts(db: Db, opts: Parameters<Db["query"]["products"]["findMany"]>[0] = {}) {
  return db.query.products.findMany({
    ...opts,
    with: {
      category: true,
      images: { with: { media: true }, orderBy: (i, { asc, desc }) => [desc(i.isMain), asc(i.position)] },
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
    images: row.images.map((i) => ({
      id: i.id,
      mediaId: i.mediaId,
      image: i.media ? mediaSrc(i.media) : i.image,
      alt: i.altText ?? i.media?.alt ?? (i.alt ? { fr: i.alt } : null),
      altOverride: i.altText,
      isMain: i.isMain,
      width: i.media?.width ?? null,
      height: i.media?.height ?? null,
    })),
    variants,
  }
}

/** Columns of the linked library photo, for a `leftJoin(media, eq(media.id, <owner>.imageMediaId))`. */
export const imageMediaColumns = { mediaKey: media.key, mediaSource: media.source, mediaAlt: media.alt }

interface LinkedImage {
  image: string | null
  imageMediaId: string | null
  mediaKey: string | null
  mediaSource: "bucket" | "bundled" | "external" | null
  mediaAlt: Category["description"]
}

/** The linked library photo wins, a row from before the library keeps its legacy string. */
function resolveImage(row: LinkedImage): Pick<Category, "image" | "imageMediaId" | "imageAlt"> {
  const linked = row.mediaKey && row.mediaSource ? mediaSrc({ key: row.mediaKey, source: row.mediaSource }) : null
  return { image: linked ?? row.image, imageMediaId: row.imageMediaId, imageAlt: row.mediaAlt }
}

export function toCategory(
  row: LinkedImage & {
    id: string
    slug: string
    name: Category["name"]
    description: Category["description"]
    visible: boolean
    position: number
    productCount: number
  },
): Category {
  const { mediaKey: _k, mediaSource: _s, mediaAlt: _a, ...rest } = row
  return { ...rest, ...resolveImage(row) }
}

export function toLocation(row: typeof locations.$inferSelect & Omit<LinkedImage, "image" | "imageMediaId">): Location {
  const { mediaKey: _k, mediaSource: _s, mediaAlt: _a, ...rest } = row
  return { ...rest, ...resolveImage(row) }
}
