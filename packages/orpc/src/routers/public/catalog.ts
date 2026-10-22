import { ORPCError } from "@orpc/server"
import { categories, locations, products } from "@workspace/db"
import {
  categorySchema,
  estimateShipping,
  locationSchema,
  productQuerySchema,
  productSchema,
  shippingQuoteInputSchema,
  shippingQuoteSchema,
  studioSettingsSchema,
} from "@workspace/sdk"
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm"
import { z } from "zod"
import { findProducts, toCategory, toProduct } from "../../lib/catalog"
import { getSettings } from "../../lib/settings"
import { publicProcedure } from "../../procedures"

const TAG = ["catalog"]

export const catalogRouter = {
  categories: publicProcedure
    .route({ method: "GET", path: "/categories", summary: "Visible categories, in menu order", tags: TAG })
    .output(z.array(categorySchema))
    .handler(async ({ context }) => {
      const rows = await context.db
        .select({
          id: categories.id,
          slug: categories.slug,
          name: categories.name,
          description: categories.description,
          image: categories.image,
          visible: categories.visible,
          position: categories.position,
          productCount: count(products.id),
        })
        .from(categories)
        .leftJoin(products, and(eq(products.categoryId, categories.id), eq(products.status, "published")))
        .where(eq(categories.visible, true))
        .groupBy(categories.id)
        .orderBy(asc(categories.position), asc(categories.slug))
      return rows.map(toCategory)
    }),

  products: publicProcedure
    .route({ method: "GET", path: "/products", summary: "Published products", tags: TAG })
    .input(productQuerySchema)
    .output(z.array(productSchema))
    .handler(async ({ context, input }) => {
      const [category] = input.category
        ? await context.db
            .select({ id: categories.id })
            .from(categories)
            .where(eq(categories.slug, input.category))
            .limit(1)
        : []
      if (input.category && !category) return []
      const price = input.currency === "TND" ? products.priceTnd : products.priceEur
      const search = input.q ? `%${input.q.replace(/[%_]/g, "")}%` : null
      const rows = await findProducts(context.db, {
        where: and(
          eq(products.status, "published"),
          category ? eq(products.categoryId, category.id) : undefined,
          input.featured ? eq(products.featured, true) : undefined,
          search ? or(ilike(products.ref, search), sql`${products.title}->>'fr' ilike ${search}`) : undefined,
        ),
        orderBy:
          input.sort === "price-asc"
            ? [asc(price)]
            : input.sort === "price-desc"
              ? [desc(price)]
              : input.sort === "newest"
                ? [desc(products.createdAt)]
                : [desc(products.featured), asc(products.position), asc(products.ref)],
        limit: input.limit,
      })
      return rows.map(toProduct)
    }),

  product: publicProcedure
    .route({ method: "GET", path: "/products/{slug}", summary: "One published product", tags: TAG })
    .input(z.object({ slug: z.string() }))
    .output(productSchema)
    .handler(async ({ context, input }) => {
      const [row] = await findProducts(context.db, {
        where: and(eq(products.slug, input.slug), eq(products.status, "published")),
        limit: 1,
      })
      if (!row) throw new ORPCError("NOT_FOUND", { message: "This piece does not exist." })
      return toProduct(row)
    }),

  locations: publicProcedure
    .route({ method: "GET", path: "/locations", summary: "Workshop and studio locations", tags: TAG })
    .output(z.array(locationSchema))
    .handler(({ context }) =>
      context.db.select().from(locations).where(eq(locations.visible, true)).orderBy(asc(locations.position)),
    ),

  settings: publicProcedure
    .route({ method: "GET", path: "/settings", summary: "Contact details and delivery fees", tags: TAG })
    .output(studioSettingsSchema)
    .handler(({ context }) => getSettings(context.db)),

  shippingQuote: publicProcedure
    .route({ method: "POST", path: "/shipping-quote", summary: "Delivery price for a cart and a country", tags: TAG })
    .input(shippingQuoteInputSchema)
    .output(shippingQuoteSchema)
    .handler(async ({ context, input }) => {
      const rows = await findProducts(context.db, {
        where: and(
          inArray(
            products.id,
            input.items.map((i) => i.productId),
          ),
          eq(products.status, "published"),
        ),
      })
      const byId = new Map(rows.map((r) => [r.id, r]))
      const lines = input.items.flatMap((item) => {
        const row = byId.get(item.productId)
        return row ? [{ ...row, quantity: item.quantity }] : []
      })
      if (lines.length !== input.items.length)
        throw new ORPCError("NOT_FOUND", { message: "A piece in your cart is no longer available." })
      const settings = await getSettings(context.db)
      const { available, reason, zoneName, chargeableKg, amountMinor } = estimateShipping(
        settings.shippingRates,
        lines,
        input.country,
        input.currency,
      )
      return { available, reason, zoneName, chargeableKg, amountMinor }
    }),
}
