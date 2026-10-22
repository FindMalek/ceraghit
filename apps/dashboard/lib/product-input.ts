import type { Product, ProductInput } from "@workspace/sdk"

/** The update procedure takes the whole product, so quick actions (publish, stock) resend it with one change. */
export function productToInput(product: Product, patch: Partial<ProductInput> = {}): ProductInput {
  return {
    ref: product.ref,
    categoryId: product.category.id,
    title: product.title,
    description: product.description,
    material: product.material,
    technique: product.technique,
    dimensions: product.dimensions,
    weightGrams: product.weightGrams,
    lengthCm: product.lengthCm,
    widthCm: product.widthCm,
    heightCm: product.heightCm,
    priceTnd: product.prices.TND,
    priceEur: product.prices.EUR,
    stock: product.stock,
    unique: product.unique,
    quoteOnly: product.quoteOnly,
    featured: product.featured,
    status: product.status,
    images: product.images.map(({ image, alt }) => ({ image, alt })),
    ...patch,
  }
}
