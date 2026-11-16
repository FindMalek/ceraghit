import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { categories, createDb, media, productImages, products, uploads } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { eq, inArray, like } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { ConsoleMailer } from "../src/lib/mailer"
import { DemoProvider } from "../src/lib/payments"
import type { Storage } from "../src/lib/storage"
import { adminRouter } from "../src/routers/admin"

const url = process.env.DATABASE_URL
const makeOwner = (context: () => Context) => createRouterClient(adminRouter, { context })

describe.skipIf(!url)("media library", () => {
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
  async function addProduct(n: string, mediaId: string) {
    const [category] = await db.select({ id: categories.id }).from(categories).limit(1)
    const [p] = await db
      .insert(products)
      .values({
        ref: `T${run}${n}`,
        slug: `t-${run}-${n}`,
        categoryId: category!.id,
        title: { fr: `Produit ${n}` },
        priceTnd: 1000,
        priceEur: 300,
      })
      .returning({ id: products.id })
    productIds.push(p!.id)
    await db.insert(productImages).values({ productId: p!.id, image: `s3:x${n}`, mediaId, position: 0 })
    return p!.id
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

  test("search finds by tag, by Arabic alt and by filename without accents", async () => {
    const id = await addMedia(`vase-emaille-${run}`, {
      tags: [`tag${run}`],
      alt: { fr: "Vase", ar: `مزهرية${run}` },
    })
    await addMedia(`other-${run}`)
    for (const q of [`tag${run}`, `مزهرية${run}`, `émaillé-${run}`]) {
      const found = await owner.media.list({ q, limit: 10, offset: 0, sort: "newest" })
      expect(
        found.items.map((m) => m.filename),
        q,
      ).toEqual([`vase-emaille-${run}.webp`])
    }
  })

  test("unused filter and usage sort", async () => {
    const tag = `u${run}`
    const free = await addMedia(`free-${run}`, { tags: [tag] })
    const once = await addMedia(`once-${run}`, { tags: [tag] })
    const twice = await addMedia(`twice-${run}`, { tags: [tag] })
    await addProduct("a", once)
    await addProduct("b", twice)
    await addProduct("c", twice)
    const base = { tag, limit: 10, offset: 0, sort: "newest" as const }
    expect((await owner.media.list({ ...base, unused: true })).items.map((m) => m.id)).toEqual([free])
    expect((await owner.media.list({ ...base, sort: "usage" })).items.map((m) => m.id)).toEqual([twice, once, free])
    const page = await owner.media.list({ ...base, limit: 2 })
    expect(page).toMatchObject({ total: 3, nextOffset: 2 })
    expect((await owner.media.tags()).find((t) => t.tag === tag)?.count).toBe(3)
  })

  test("remove refuses a used image and deletes an unused one with its object", async () => {
    const used = await addMedia(`used-${run}`)
    await addProduct("d", used)
    await expect(owner.media.remove({ id: used })).rejects.toMatchObject({ code: "CONFLICT" })
    expect(await db.select().from(media).where(eq(media.id, used))).toHaveLength(1)

    const key = `${prefix}media/gone-${run}.webp`
    const gone = await addMedia(`gone-${run}`, { key })
    await db.insert(uploads).values({ key, folder: "media", contentType: "image/webp", bytes: 100 })
    expect(await owner.media.remove({ id: gone })).toEqual({ ok: true })
    expect(await db.select().from(media).where(eq(media.id, gone))).toHaveLength(0)
    expect(await db.select().from(uploads).where(eq(uploads.key, key))).toHaveLength(0)
    expect(removed).toEqual([key])

    const bundled = await addMedia(`bundled-${run}`, { source: "bundled", key: `/catalogue/${run}.webp` })
    await expect(owner.media.remove({ id: bundled })).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  test("update renames the display name only", async () => {
    const id = await addMedia(`old-${run}`)
    const before = (await owner.media.get({ id })).key
    const updated = await owner.media.update({
      id,
      filename: "Vase Noir Brillant",
      tags: ["Noir", "vase", "noir"],
      keep: true,
    })
    expect(updated).toMatchObject({
      filename: "vase-noir-brillant.webp",
      key: before,
      tags: ["noir", "vase"],
      keep: true,
    })
  })

  test("usage lists the product and the category with labels", async () => {
    const id = await addMedia(`shared-${run}`)
    const productId = await addProduct("e", id)
    const [cat] = await db
      .insert(categories)
      .values({ slug: `c-${run}`, name: { fr: `Catégorie ${run}` }, imageMediaId: id })
      .returning({ id: categories.id })
    categoryIds.push(cat!.id)
    const detail = await owner.media.get({ id })
    expect(detail.usage).toEqual([
      { kind: "product", id: productId, label: `Produit e (T${run}e)`, href: `/products/${productId}` },
      { kind: "category", id: cat!.id, label: `Catégorie ${run}`, href: "/categories" },
    ])
    expect(detail.usageCount).toBe(2)
  })

  test("an empty patch returns the image, a tag filter ignores case, % and _ are literal", async () => {
    const tag = `Mix${run}`
    const id = await addMedia(`plain-${run}`, { tags: [tag.toLowerCase()] })
    expect((await owner.media.update({ id })).id).toBe(id)
    const base = { limit: 10, offset: 0, sort: "newest" as const }
    expect((await owner.media.list({ ...base, tag })).items.map((m) => m.id)).toEqual([id])
    expect((await owner.media.list({ ...base, q: `%${run}` })).items).toHaveLength(0)
    expect((await owner.media.list({ ...base, q: `pl_in-${run}` })).items).toHaveLength(0)
  })

  test("remove waits for a concurrent attach and then refuses", async () => {
    const id = await addMedia(`race-${run}`)
    const [category] = await db.select({ id: categories.id }).from(categories).limit(1)
    let release!: () => void
    let attached!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const ready = new Promise<void>((r) => (attached = r))
    const attach = db.transaction(async (tx) => {
      const [p] = await tx
        .insert(products)
        .values({
          ref: `T${run}r`,
          slug: `t-${run}-r`,
          categoryId: category!.id,
          title: { fr: "Race" },
          priceTnd: 1000,
          priceEur: 300,
        })
        .returning({ id: products.id })
      productIds.push(p!.id)
      await tx.insert(productImages).values({ productId: p!.id, image: "s3:race", mediaId: id, position: 0 })
      attached()
      await gate
    })
    await ready
    const removing = owner.media.remove({ id }).then(
      () => "removed",
      (e) => e.code as string,
    )
    release()
    await attach
    expect(await removing).toBe("CONFLICT")
    expect(await db.select().from(media).where(eq(media.id, id))).toHaveLength(1)
  })
})
