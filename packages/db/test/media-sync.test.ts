import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createDb, media, productImages } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { and, eq, inArray, isNull, like, sql } from "drizzle-orm"
import { BUNDLED_MEDIA } from "../src/seed/bundled-media"
import { syncBundledMedia } from "../src/seed/media"

const url = process.env.DATABASE_URL

describe.skipIf(!url)("bundled media sync", () => {
  const db = createDb(url!)
  const sample = BUNDLED_MEDIA.find((m) => m.key === "/catalogue/0010-1.webp")!

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { catalog: true })
  })
  afterAll(() => db.close())

  test("links every catalogue photo, fills missing metadata and leaves owner edits alone", async () => {
    await db
      .update(media)
      .set({ alt: { fr: "Mon texte" }, filename: "ma-piece.webp", tags: ["perso"], bytes: 0, width: null, hash: null })
      .where(eq(media.key, sample.key))
    await db.update(productImages).set({ mediaId: null, isMain: false }).where(eq(productImages.image, sample.key))

    await syncBundledMedia(db)

    const [row] = await db.select().from(media).where(eq(media.key, sample.key))
    expect(row).toMatchObject({
      bytes: sample.bytes,
      width: sample.width,
      hash: sample.hash,
      alt: { fr: "Mon texte" },
      filename: "ma-piece.webp",
      tags: ["perso"],
    })
    const unlinked = await db
      .select({ id: productImages.id })
      .from(productImages)
      .where(and(like(productImages.image, "/catalogue/%"), isNull(productImages.mediaId)))
    expect(unlinked).toEqual([])
    const noMain = await db.execute(sql`
      select product_id from product_images group by product_id
      having bool_or(is_main) is not true and bool_or(image like '/catalogue/%')`)
    expect(noMain.length).toBe(0)
    const keys = BUNDLED_MEDIA.map((m) => m.key)
    const rows = await db.select({ key: media.key }).from(media).where(inArray(media.key, keys))
    expect(rows.length).toBe(keys.length)
  })

  test("a row seeded with older file facts is brought up to the manifest, owner edits stay", async () => {
    await db
      .update(media)
      .set({ width: 1079, height: 1560, bytes: 1, alt: { fr: "Texte du studio" }, tags: ["perso"] })
      .where(eq(media.key, sample.key))

    await syncBundledMedia(db)

    const [row] = await db.select().from(media).where(eq(media.key, sample.key))
    expect(row).toMatchObject({
      width: sample.width,
      height: sample.height,
      bytes: sample.bytes,
      alt: { fr: "Texte du studio" },
      tags: ["perso"],
    })
  })
})
