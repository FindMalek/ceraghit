import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { categories, createDb, locations, media } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { eq, like } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { ConsoleMailer } from "../src/lib/mailer"
import { DemoProvider } from "../src/lib/payments"
import type { Storage } from "../src/lib/storage"
import { adminRouter } from "../src/routers/admin"
import { publicRouter } from "../src/routers/public"
import { clearVisitorLimits, visitorHeaders } from "./fixtures/visitor"

const url = process.env.DATABASE_URL
const makeOwner = (context: () => Context) => createRouterClient(adminRouter, { context })
const makeVisitor = (context: () => Context) => createRouterClient(publicRouter, { context })

describe.skipIf(!url)("category and location images from the library", () => {
  const db = createDb(url!)
  const run = crypto.randomUUID().slice(0, 8)
  let owner: ReturnType<typeof makeOwner>
  let visitor: ReturnType<typeof makeVisitor>
  const mediaIds: Record<"confirmed" | "pending", string> = { confirmed: "", pending: "" }

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { catalog: true, admin: { email: "owner@test.local", password: "clay-test-pass" } })
    const services: Services = {
      db,
      payments: new DemoProvider("https://web.test"),
      mailer: new ConsoleMailer(),
      storage: {
        bucket: "b",
        prefix: "",
        presignPut: async (key) => key,
        put: async () => {},
        signedGet: async (key) => key,
        head: async () => true,
        read: async () => null,
        readUrl: async (key) => key,
        publicUrl: () => null,
        remove: async () => {},
        list: async () => [],
      } as Storage,
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
    const headers = new Headers({
      cookie: `ceraghit_admin=${session?.token}`,
      "x-csrf-token": "orpc",
      "x-forwarded-for": "127.0.0.1",
    })
    owner = makeOwner(() => createContext(services, headers))
    visitor = makeVisitor(() => createContext(services, visitorHeaders()))
    const base = {
      source: "bucket" as const,
      mime: "image/webp",
      bytes: 10,
      width: 100,
      height: 100,
      alt: { fr: "Vase" },
    }
    const [confirmed] = await db
      .insert(media)
      .values({
        ...base,
        key: `pr-${run}/c.webp`,
        filename: `c-${run}.webp`,
        originalName: "c.webp",
        confirmedAt: new Date(),
      })
      .returning({ id: media.id })
    const [pending] = await db
      .insert(media)
      .values({ ...base, key: `pr-${run}/p.webp`, filename: `p-${run}.webp`, originalName: "p.webp" })
      .returning({ id: media.id })
    mediaIds.confirmed = confirmed!.id
    mediaIds.pending = pending!.id
  })

  afterAll(async () => {
    await db.delete(categories).where(like(categories.slug, `%${run}%`))
    await db.delete(locations).where(eq(locations.name, `loc-${run}`))
    await db.delete(media).where(like(media.key, `pr-${run}/%`))
    await clearVisitorLimits(db)
    await db.close()
  })

  test("a category takes its image from the picked photo and the photo becomes used, clearing frees it", async () => {
    const { id } = await owner.categories.create({ name: { fr: `Cat ${run}` }, imageMediaId: mediaIds.confirmed })
    const saved = (await owner.categories.list()).find((c) => c.id === id)
    expect(saved).toMatchObject({
      image: `s3:pr-${run}/c.webp`,
      imageMediaId: mediaIds.confirmed,
      imageAlt: { fr: "Vase" },
    })
    expect((await owner.media.get({ id: mediaIds.confirmed })).usageCount).toBe(1)
    expect((await visitor.catalog.categories()).find((c) => c.id === id)?.image).toBe(`s3:pr-${run}/c.webp`)

    await owner.categories.update({ id, name: { fr: `Cat ${run}` }, imageMediaId: null })
    expect((await owner.categories.list()).find((c) => c.id === id)).toMatchObject({ image: null, imageMediaId: null })
    expect((await owner.media.get({ id: mediaIds.confirmed })).usageCount).toBe(0)
  })

  test("an unconfirmed or unknown photo is refused", async () => {
    await expect(
      owner.categories.create({ name: { fr: `Bad ${run}` }, imageMediaId: mediaIds.pending }),
    ).rejects.toThrow("no longer available")
    await expect(
      owner.locations.create({
        name: `loc-${run}`,
        address: "1 rue",
        city: "Tunis",
        imageMediaId: crypto.randomUUID(),
      }),
    ).rejects.toThrow("no longer available")
  })

  test("a location picks a photo, and a legacy string image survives an edit that does not touch the picture", async () => {
    const { id } = await owner.locations.create({
      name: `loc-${run}`,
      address: "1 rue",
      city: "Tunis",
      imageMediaId: mediaIds.confirmed,
    })
    expect((await visitor.catalog.locations()).find((l) => l.id === id)).toMatchObject({
      image: `s3:pr-${run}/c.webp`,
      imageMediaId: mediaIds.confirmed,
    })
    await db.update(locations).set({ imageMediaId: null, image: "/catalogue/legacy.webp" }).where(eq(locations.id, id))
    await owner.locations.update({ id, name: `loc-${run}`, address: "2 rue", city: "Tunis" })
    expect((await owner.locations.list()).find((l) => l.id === id)).toMatchObject({
      address: "2 rue",
      image: "/catalogue/legacy.webp",
      imageMediaId: null,
    })
  })
})
