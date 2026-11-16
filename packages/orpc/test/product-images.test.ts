import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { categories, createDb, media, productImages, products, uploads } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { asc, eq, inArray, like } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { findProducts, toProduct } from "../src/lib/catalog"
import { ConsoleMailer } from "../src/lib/mailer"
import { DemoProvider } from "../src/lib/payments"
import type { Storage } from "../src/lib/storage"
import { adminRouter } from "../src/routers/admin"

const url = process.env.DATABASE_URL
const makeOwner = (context: () => Context) => createRouterClient(adminRouter, { context })

describe.skipIf(!url)("product gallery", () => {
  const db = createDb(url!)
  const run = crypto.randomUUID().slice(0, 8)
  const prefix = `pr-${run}/`
  const removed: string[] = []
  const storage: Storage = {
    bucket: "b",
    prefix,
    presignPut: async (key) => key,
    head: async () => true,
    read: async () => null,
    readUrl: async (key) => key,
    publicUrl: () => null,
    remove: async (key) => void removed.push(key),
    list: async () => [],
  }
  let owner: ReturnType<typeof makeOwner>
  const mediaIds: string[] = []
  const productIds: string[] = []
  const categoryIds: string[] = []

  async function addMedia(name: string, over: Partial<typeof media.$inferInsert> = {}) {
    const [row] = await db
      .insert(media)
      .values({
        key: `${prefix}media/${name}.webp`,
        filename: `${name}.webp`,
        bytes: 100,
        hash: crypto.randomUUID().replaceAll("-", "").padEnd(64, "0"),
        confirmedAt: new Date(),
        ...over,
      })
      .returning({ id: media.id })
    mediaIds.push(row!.id)
    return row!.id
  }
  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { catalog: true, admin: { email: "owner@test.local", password: "clay-test-pass" } })
    const services: Services = {
      db,
      payments: new DemoProvider("https://web.test"),
      mailer: new ConsoleMailer(),
      storage,
      auth: new AdminAuth(db),
      now: () => new Date(),
      config: {
        webUrl: "https://web.test",
        apiPublicUrl: "https://api.test",
        appEnv: "local",
        deployEnv: "test",
        secureCookies: false,
        onlinePayments: true,
      },
    }
    const session = await services.auth.login("127.0.0.1", "owner@test.local", "clay-test-pass")
    const headers = () =>
      new Headers({
        cookie: `ceraghit_admin=${session!.token}`,
        "x-csrf-token": "orpc",
        "x-forwarded-for": `lib-${run}`,
      })
    owner = makeOwner(() => createContext(services, headers()))
  })

  afterAll(async () => {
    if (productIds.length) {
      await db.delete(productImages).where(inArray(productImages.productId, productIds))
      await db.delete(products).where(inArray(products.id, productIds))
    }
    if (categoryIds.length) await db.delete(categories).where(inArray(categories.id, categoryIds))
    await db.delete(media).where(like(media.key, `${prefix}%`))
    await db.delete(uploads).where(like(uploads.key, `${prefix}%`))
    await db.close()
  })

  async function category() {
    const [row] = await db.select({ id: categories.id }).from(categories).limit(1)
    return row!.id
  }
  async function create(n: string, images: { mediaId: string; isMain?: boolean; alt?: { fr: string } }[]) {
    const product = await owner.products.create({
      ref: `G${run}${n}`,
      categoryId: await category(),
      title: { fr: `Galerie ${n}` },
      weightGrams: 500,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
      priceTnd: 1000,
      priceEur: 300,
      stock: 1,
      unique: false,
      quoteOnly: false,
      featured: false,
      status: "draft",
      variants: [],
      images,
    })
    productIds.push(product.id)
    return product
  }
  const input = (p: Awaited<ReturnType<typeof create>>, images: Parameters<typeof create>[1]) => ({
    ref: p.ref,
    categoryId: p.category.id,
    title: p.title,
    weightGrams: p.weightGrams,
    lengthCm: p.lengthCm,
    widthCm: p.widthCm,
    heightCm: p.heightCm,
    priceTnd: p.prices.TND,
    priceEur: p.prices.EUR,
    stock: p.stock,
    unique: false,
    quoteOnly: false,
    featured: false,
    status: "draft" as const,
    variants: [],
    images,
    id: p.id,
  })
  const publicOrder = async (id: string) => {
    const [row] = await findProducts(db, { where: eq(products.id, id), limit: 1 })
    return toProduct(row!).images
  }
  const usage = async (id: string) => (await owner.media.get({ id })).usageCount
  const rows = (id: string) =>
    db.select().from(productImages).where(eq(productImages.productId, id)).orderBy(asc(productImages.position))

  test("the main photo comes first, the others keep the owner's order, positions are dense", async () => {
    const [a, b, c] = [await addMedia(`a-${run}`), await addMedia(`b-${run}`), await addMedia(`c-${run}`)]
    const p = await create("1", [{ mediaId: b }, { mediaId: a, isMain: true }, { mediaId: c }])
    expect((await publicOrder(p.id)).map((i) => i.mediaId)).toEqual([a, b, c])
    expect((await rows(p.id)).map((r) => r.position)).toEqual([0, 1, 2])
    expect((await rows(p.id)).map((r) => r.image)).toEqual([
      `s3:${prefix}media/b-${run}.webp`,
      `s3:${prefix}media/a-${run}.webp`,
      `s3:${prefix}media/c-${run}.webp`,
    ])
  })

  test("set main, reorder and remove in one save keep one main and the usage counts", async () => {
    const [a, b, c] = [await addMedia(`d-${run}`), await addMedia(`e-${run}`), await addMedia(`f-${run}`)]
    const p = await create("2", [{ mediaId: a, isMain: true }, { mediaId: b }, { mediaId: c }])
    expect(await usage(c)).toBe(1)
    await owner.products.update(input(p, [{ mediaId: c, isMain: true }, { mediaId: a }]))
    const after = await publicOrder(p.id)
    expect(after.map((i) => i.mediaId)).toEqual([c, a])
    expect(after.filter((i) => i.isMain)).toHaveLength(1)
    expect([await usage(a), await usage(b), await usage(c)]).toEqual([1, 0, 1])
    await owner.products.update(input(p, [{ mediaId: a }, { mediaId: c }]))
    const first = (await publicOrder(p.id)).map((i) => [i.mediaId, i.isMain])
    expect(first).toEqual([
      [a, true],
      [c, false],
    ])
  })

  test("a photo's own alt wins over the library alt", async () => {
    const withAlt = await addMedia(`g-${run}`, { alt: { fr: "Du catalogue", en: "Library" } })
    const p = await create("3", [{ mediaId: withAlt }])
    expect((await publicOrder(p.id))[0]?.alt).toEqual({ fr: "Du catalogue", en: "Library" })
    await owner.products.update(input(p, [{ mediaId: withAlt, alt: { fr: "Sur cette fiche", ...{ ar: "هنا" } } }]))
    expect((await publicOrder(p.id))[0]?.alt).toEqual({ fr: "Sur cette fiche", ar: "هنا" })
  })

  test("two mains, a duplicate photo, more than twelve photos and an unconfirmed photo are refused", async () => {
    const [a, b] = [await addMedia(`h-${run}`), await addMedia(`i-${run}`)]
    const pending = await addMedia(`j-${run}`, { confirmedAt: null })
    const p = await create("4", [{ mediaId: a }])
    await expect(
      owner.products.update(
        input(p, [
          { mediaId: a, isMain: true },
          { mediaId: b, isMain: true },
        ]),
      ),
    ).rejects.toThrow()
    await expect(owner.products.update(input(p, [{ mediaId: a }, { mediaId: a }]))).rejects.toThrow()
    await expect(
      owner.products.update(
        input(
          p,
          Array.from({ length: 13 }, () => ({ mediaId: crypto.randomUUID() })),
        ),
      ),
    ).rejects.toThrow()
    await expect(owner.products.update(input(p, [{ mediaId: pending }]))).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(owner.products.update(input(p, [{ mediaId: crypto.randomUUID() }]))).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
    expect((await publicOrder(p.id)).map((i) => i.mediaId)).toEqual([a])
  })

  test("a photo row from before the gallery (no media) still reads", async () => {
    const p = await create("5", [])
    await db
      .insert(productImages)
      .values({ productId: p.id, image: "/catalogue/old.webp", alt: "Ancienne", position: 0, isMain: true })
    const [image] = await publicOrder(p.id)
    expect(image).toMatchObject({ mediaId: null, image: "/catalogue/old.webp", alt: { fr: "Ancienne" }, isMain: true })
  })

  test("concurrent main changes on one product leave exactly one main", async () => {
    const [a, b, c] = [await addMedia(`k-${run}`), await addMedia(`l-${run}`), await addMedia(`m-${run}`)]
    const p = await create("6", [{ mediaId: a, isMain: true }, { mediaId: b }, { mediaId: c }])
    const results = await Promise.allSettled(
      [a, b, c, b, c, a].map((main) =>
        owner.products.update(
          input(
            p,
            [a, b, c].map((mediaId) => ({ mediaId, isMain: mediaId === main })),
          ),
        ),
      ),
    )
    expect(results.every((r) => r.status === "fulfilled")).toBe(true)
    const final = await rows(p.id)
    expect(final.filter((r) => r.isMain)).toHaveLength(1)
    expect(final.map((r) => r.position)).toEqual([0, 1, 2])
  })
})
