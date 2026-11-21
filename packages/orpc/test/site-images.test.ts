import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { createDb, media, siteImages } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { DEFAULT_SITE_IMAGES, SITE_SLOT_KEYS, type SiteSlot } from "@workspace/sdk"
import { eq } from "drizzle-orm"
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

function adminHeaders(session: { token: string }) {
  return new Headers({
    cookie: `ceraghit_admin=${session.token}`,
    "x-csrf-token": "orpc",
    "x-forwarded-for": "127.0.0.1",
  })
}

describe.skipIf(!url)("site images", () => {
  const db = createDb(url!)
  const run = crypto.randomUUID().slice(0, 8)
  let owner: ReturnType<typeof makeOwner>
  let visitor: ReturnType<typeof makeVisitor>

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
    const ctx = () => createContext(services, adminHeaders(session!))
    const vctx = () => createContext(services, visitorHeaders())
    owner = makeOwner(ctx)
    visitor = makeVisitor(vctx)
  })

  beforeEach(async () => {
    await db.delete(siteImages)
    await seed(db, { catalog: false })
  })

  afterAll(async () => {
    await clearVisitorLimits(db)
    await db.close()
  })

  test("public read returns the bundled defaults per slot", async () => {
    const images = await visitor.site.images()
    for (const slot of SITE_SLOT_KEYS) {
      expect(images[slot].map((i: { image: string }) => i.image)).toEqual(DEFAULT_SITE_IMAGES[slot])
    }
  })

  test("reordering a slot is reflected publicly, hidden slides stay admin-only", async () => {
    const admin = await owner.site.images()
    const hero = admin.hero
    expect(hero.length).toBeGreaterThanOrEqual(2)
    const a = hero[0]!
    const b = hero[1]!
    await owner.site.saveSlot({ slot: "hero", images: [{ mediaId: b.mediaId }, { mediaId: a.mediaId }] })

    const publicImages = await visitor.site.images()
    expect(publicImages.hero.map((i: { image: string }) => i.image)).toEqual([b.image, a.image])

    const adminAgain = await owner.site.images()
    expect(adminAgain.hero.map((i: { image: string }) => i.image)).toEqual([b.image, a.image])
  })

  test("a hidden demo hero slide is returned to admin but not to visitors", async () => {
    await db.delete(siteImages)
    await seed(db, { catalog: false, demo: true })
    const admin = await owner.site.images()
    const hidden = admin.hero.find((i) => !i.visible)
    expect(hidden).toBeDefined()
    const publicImages = await visitor.site.images()
    expect(publicImages.hero.some((i: { image: string }) => i.image === hidden!.image)).toBe(false)
  })

  test("single slots reject multiple images and required slots need one visible image", async () => {
    const admin = await owner.site.images()
    const logo = admin.logo[0]!
    const texture = admin.texture[0]!

    await expect(
      owner.site.saveSlot({ slot: "logo", images: [{ mediaId: logo.mediaId }, { mediaId: texture.mediaId }] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })

    await expect(
      owner.site.saveSlot({ slot: "hero", images: [{ mediaId: admin.hero[0]!.mediaId, visible: false }] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  test("deleting media used by a site slot is refused and listed as usage", async () => {
    const [m] = await db
      .insert(media)
      .values({
        key: `/site/test-${run}.webp`,
        filename: `test-${run}.webp`,
        bytes: 100,
        hash: crypto.randomUUID().replaceAll("-", "").padEnd(64, "0"),
        confirmedAt: new Date(),
      })
      .returning({ id: media.id })
    await owner.site.saveSlot({ slot: "texture", images: [{ mediaId: m!.id }] })
    await expect(owner.media.remove({ id: m!.id })).rejects.toMatchObject({ code: "CONFLICT" })
    const detail = await owner.media.get({ id: m!.id })
    expect(detail.usage.some((u: { kind: string }) => u.kind === "site")).toBe(true)
  })

  test("re-seeding does not overwrite edited slots", async () => {
    const admin = await owner.site.images()
    const a = admin.hero[0]!
    await owner.site.saveSlot({ slot: "hero", images: [{ mediaId: a.mediaId }] })
    await seed(db, { catalog: false })
    const after = await owner.site.images()
    expect(after.hero).toHaveLength(1)
    expect(after.hero[0]!.image).toBe(a.image)
  })

  test("saveSlot refuses a media row that no longer exists", async () => {
    await expect(
      owner.site.saveSlot({ slot: "texture", images: [{ mediaId: "00000000-0000-0000-0000-000000000000" }] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })
})
