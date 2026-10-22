import { ORPCError } from "@orpc/server"
import { categories, orderItems, productImages, products } from "@workspace/db"
import {
  categoryInputSchema,
  categorySchema,
  productInputSchema,
  productSchema,
  productStatusSchema,
  slugify,
} from "@workspace/sdk"
import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm"
import { z } from "zod"
import { findProducts, toCategory, toProduct } from "../../lib/catalog"
import { syncVariants } from "../../lib/variants"
import { adminProcedure } from "../../procedures"

const TAG = ["admin"]
const idInput = z.object({ id: z.string() })

async function uniqueSlug(db: Parameters<typeof findProducts>[0], base: string, ignoreId?: string) {
  let slug = base
  for (let n = 2; ; n++) {
    const clash = await db.query.products.findFirst({ where: eq(products.slug, slug), columns: { id: true } })
    if (!clash || clash.id === ignoreId) return slug
    slug = `${base}-${n}`
  }
}

export const productsRouter = {
  list: adminProcedure
    .route({ method: "GET", path: "/admin/products", summary: "All products, drafts included", tags: TAG })
    .input(
      z.object({
        status: productStatusSchema.optional(),
        categoryId: z.string().optional(),
        q: z.string().trim().max(80).optional(),
      }),
    )
    .output(z.array(productSchema))
    .handler(async ({ context, input }) => {
      const search = input.q ? `%${input.q.replace(/[%_]/g, "")}%` : null
      const rows = await findProducts(context.db, {
        where: and(
          input.status ? eq(products.status, input.status) : undefined,
          input.categoryId ? eq(products.categoryId, input.categoryId) : undefined,
          search ? or(ilike(products.ref, search), sql`${products.title}->>'fr' ilike ${search}`) : undefined,
        ),
        orderBy: [asc(products.ref)],
      })
      return rows.map(toProduct)
    }),

  get: adminProcedure
    .route({ method: "GET", path: "/admin/products/{id}", summary: "One product", tags: TAG })
    .input(idInput)
    .output(productSchema)
    .handler(async ({ context, input }) => {
      const [row] = await findProducts(context.db, { where: eq(products.id, input.id), limit: 1 })
      if (!row) throw new ORPCError("NOT_FOUND", { message: "Product not found." })
      return toProduct(row)
    }),

  create: adminProcedure
    .route({ method: "POST", path: "/admin/products", summary: "Create a product", tags: TAG })
    .input(productInputSchema)
    .output(productSchema)
    .handler(async ({ context, input }) => {
      const { images, variants, priceTnd, priceEur, stock, ...rest } = input
      const taken = await context.db.query.products.findFirst({
        where: eq(products.ref, input.ref),
        columns: { id: true },
      })
      if (taken) throw new ORPCError("CONFLICT", { message: `Reference ${input.ref} already exists.` })
      const slug = await uniqueSlug(context.db, `${slugify(input.title.fr)}-${slugify(input.ref)}`)
      const id = await context.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(products)
          .values({
            ...rest,
            description: rest.description ?? null,
            material: rest.material ?? null,
            technique: rest.technique ?? null,
            priceTnd,
            priceEur,
            stock,
            slug,
          })
          .returning({ id: products.id })
        if (images.length) {
          await tx
            .insert(productImages)
            .values(images.map((img, position) => ({ ...img, productId: row!.id, position })))
        }
        const aggregate = await syncVariants(tx, row!.id, variants)
        if (aggregate) await tx.update(products).set(aggregate).where(eq(products.id, row!.id))
        return row!.id
      })
      const [created] = await findProducts(context.db, { where: eq(products.id, id), limit: 1 })
      return toProduct(created!)
    }),

  update: adminProcedure
    .route({ method: "PUT", path: "/admin/products/{id}", summary: "Update a product", tags: TAG })
    .input(productInputSchema.extend({ id: z.string() }))
    .output(productSchema)
    .handler(async ({ context, input }) => {
      const { id, images, variants, ...rest } = input
      const clash = await context.db.query.products.findFirst({
        where: eq(products.ref, input.ref),
        columns: { id: true },
      })
      if (clash && clash.id !== id)
        throw new ORPCError("CONFLICT", { message: `Reference ${input.ref} already exists.` })
      await context.db.transaction(async (tx) => {
        const updated = await tx
          .update(products)
          .set({
            ...rest,
            description: rest.description ?? null,
            material: rest.material ?? null,
            technique: rest.technique ?? null,
            updatedAt: context.now(),
          })
          .where(eq(products.id, id))
          .returning({ id: products.id })
        if (!updated.length) throw new ORPCError("NOT_FOUND", { message: "Product not found." })
        await tx.delete(productImages).where(eq(productImages.productId, id))
        if (images.length)
          await tx.insert(productImages).values(images.map((img, position) => ({ ...img, productId: id, position })))
        const aggregate = await syncVariants(tx, id, variants)
        if (aggregate) await tx.update(products).set(aggregate).where(eq(products.id, id))
      })
      const [row] = await findProducts(context.db, { where: eq(products.id, id), limit: 1 })
      return toProduct(row!)
    }),

  /** A product that was ordered is archived instead, so order history keeps pointing at it. */
  remove: adminProcedure
    .route({ method: "DELETE", path: "/admin/products/{id}", summary: "Delete (or archive) a product", tags: TAG })
    .input(idInput)
    .output(z.object({ archived: z.boolean() }))
    .handler(async ({ context, input }) => {
      const [{ n } = { n: 0 }] = await context.db
        .select({ n: count() })
        .from(orderItems)
        .where(eq(orderItems.productId, input.id))
      if (n > 0) {
        await context.db.update(products).set({ status: "archived" }).where(eq(products.id, input.id))
        return { archived: true }
      }
      await context.db.delete(products).where(eq(products.id, input.id))
      return { archived: false }
    }),
}

export const categoriesRouter = {
  list: adminProcedure
    .route({ method: "GET", path: "/admin/categories", summary: "All categories, hidden included", tags: TAG })
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
        .leftJoin(products, eq(products.categoryId, categories.id))
        .groupBy(categories.id)
        .orderBy(asc(categories.position), asc(categories.slug))
      return rows.map(toCategory)
    }),

  create: adminProcedure
    .route({ method: "POST", path: "/admin/categories", summary: "Create a category", tags: TAG })
    .input(categoryInputSchema)
    .output(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const base = slugify(input.name.fr)
      const [last] = await context.db
        .select({ p: categories.position })
        .from(categories)
        .orderBy(desc(categories.position))
        .limit(1)
      let slug = base
      for (let n = 2; await context.db.query.categories.findFirst({ where: eq(categories.slug, slug) }); n++)
        slug = `${base}-${n}`
      const [row] = await context.db
        .insert(categories)
        .values({
          ...input,
          description: input.description ?? null,
          image: input.image ?? null,
          slug,
          position: (last?.p ?? -1) + 1,
        })
        .returning({ id: categories.id })
      return { id: row!.id }
    }),

  update: adminProcedure
    .route({ method: "PUT", path: "/admin/categories/{id}", summary: "Update a category", tags: TAG })
    .input(categoryInputSchema.extend({ id: z.string() }))
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      const { id, ...values } = input
      const updated = await context.db
        .update(categories)
        .set({ ...values, description: values.description ?? null, image: values.image ?? null })
        .where(eq(categories.id, id))
        .returning({ id: categories.id })
      if (!updated.length) throw new ORPCError("NOT_FOUND", { message: "Category not found." })
      return { ok: true as const }
    }),

  reorder: adminProcedure
    .route({ method: "POST", path: "/admin/categories/reorder", summary: "Set the menu order", tags: TAG })
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      await context.db.transaction(async (tx) => {
        for (const [position, id] of input.ids.entries())
          await tx.update(categories).set({ position }).where(eq(categories.id, id))
      })
      return { ok: true as const }
    }),

  remove: adminProcedure
    .route({ method: "DELETE", path: "/admin/categories/{id}", summary: "Delete an empty category", tags: TAG })
    .input(idInput)
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      const [{ n } = { n: 0 }] = await context.db
        .select({ n: count() })
        .from(products)
        .where(eq(products.categoryId, input.id))
      if (n > 0) throw new ORPCError("CONFLICT", { message: "Move or delete the products in this category first." })
      await context.db.delete(categories).where(eq(categories.id, input.id))
      return { ok: true as const }
    }),
}
