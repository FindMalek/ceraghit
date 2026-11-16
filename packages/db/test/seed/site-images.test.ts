import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createDb, siteImages } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { DEFAULT_SITE_IMAGES } from "@workspace/sdk"
import { eq } from "drizzle-orm"
import { DEMO_HIDDEN_HERO } from "../../src/seed/media"

const url = process.env.DATABASE_URL

describe.skipIf(!url)("site image seed", () => {
  const db = createDb(url!)

  beforeAll(async () => {
    await runMigrations(db)
  })

  afterAll(async () => {
    await db.close()
  })

  test("the demo hidden hero references a bundled picture", () => {
    expect(DEFAULT_SITE_IMAGES.hero).not.toContain(DEMO_HIDDEN_HERO)
  })

  test("seed fills site_images with defaults on a fresh database", async () => {
    await db.delete(siteImages)
    await seed(db, { catalog: false })
    const rows = await db.select().from(siteImages)
    expect(rows.length).toBe(Object.values(DEFAULT_SITE_IMAGES).flat().length)
    for (const row of rows) expect(row.visible).toBe(true)
  })

  test("demo seed adds one hidden hero slide", async () => {
    await db.delete(siteImages)
    await seed(db, { catalog: false, demo: true })
    const hidden = await db.select().from(siteImages).where(eq(siteImages.visible, false))
    expect(hidden).toHaveLength(1)
    expect(hidden[0]!.slot).toBe("hero")
    expect(hidden[0]!.visible).toBe(false)
  })

  test("second seed run leaves existing site_images untouched", async () => {
    await db.delete(siteImages)
    await seed(db, { catalog: false })
    const first = await db.select().from(siteImages)
    await seed(db, { catalog: false })
    const second = await db.select().from(siteImages)
    expect(second.map((r) => r.id).sort()).toEqual(first.map((r) => r.id).sort())
  })
})
