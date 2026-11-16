import { afterAll, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { categories, createDb, locations, media, productImages, products, uploads } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import * as schema from "@workspace/db/schema"
import { eq, inArray, is, sql } from "drizzle-orm"
import { getTableConfig, PgTable } from "drizzle-orm/pg-core"
import { MEDIA_REFERENCES } from "../src/lib/media"

const url = process.env.DATABASE_URL
const BACKFILL = new URL("../../db/drizzle/0012_media_backfill.sql", import.meta.url).pathname

test("every foreign key to media.id is listed in MEDIA_REFERENCES", () => {
  const found: string[] = []
  for (const t of Object.values(schema)) {
    if (!is(t, PgTable)) continue
    const cfg = getTableConfig(t)
    for (const fk of cfg.foreignKeys) {
      const ref = fk.reference()
      if (getTableConfig(ref.foreignTable).name === "media")
        found.push(`${cfg.name}.${ref.columns.map((c) => c.name).join()}`)
    }
  }
  const listed = MEDIA_REFERENCES.map((r) => `${getTableConfig(r.table).name}.${r.column.name}`)
  expect(listed.sort()).toEqual(found.sort())
})

describe.skipIf(!url)("media backfill and cleanup", () => {
  const db = createDb(url!)
  const run = crypto.randomUUID().slice(0, 8)
  const keys = {
    bucket: `pr-${run}/products/a.webp`,
    bundled: `/catalogue/${run}-0010-1.webp`,
    pinned: `pr-${run}/media/pinned.webp`,
    used: `pr-${run}/media/used.webp`,
    lost: `pr-${run}/media/lost.webp`,
  }
  const ids = { cat: "", product: "" }

  afterAll(async () => {
    await db.delete(productImages).where(eq(productImages.productId, ids.product))
    await db.delete(products).where(eq(products.id, ids.product))
    await db.delete(locations).where(eq(locations.name, `loc-${run}`))
    await db.delete(categories).where(eq(categories.id, ids.cat))
    await db.delete(media).where(sql`${media.key} like ${`%${run}%`}`)
    await db.delete(uploads).where(sql`${uploads.key} like ${`%${run}%`}`)
    await db.close()
  })

  const backfill = async () => {
    for (const statement of readFileSync(BACKFILL, "utf8").split("--> statement-breakpoint"))
      await db.execute(sql.raw(statement))
  }

  test("links legacy image strings to media, one main image per product, and can run twice", async () => {
    await runMigrations(db)
    const [cat] = await db
      .insert(categories)
      .values({ slug: `c-${run}`, name: { fr: "T" }, image: `s3:${keys.bucket}` })
      .returning()
    ids.cat = cat!.id
    await db.insert(locations).values({ name: `loc-${run}`, address: "a", city: "c", image: keys.bundled })
    const [product] = await db
      .insert(products)
      .values({ ref: run, slug: `p-${run}`, categoryId: ids.cat, title: { fr: "T" }, priceTnd: 1000, priceEur: 300 })
      .returning()
    ids.product = product!.id
    await db.insert(uploads).values({ key: keys.bucket, folder: "products", contentType: "image/webp", bytes: 1234 })
    await db.insert(productImages).values([
      { productId: ids.product, image: `s3:${keys.bucket}`, alt: "Vase", position: 1 },
      { productId: ids.product, image: keys.bundled, alt: "  ", position: 0 },
    ])

    await backfill()
    await backfill()

    const rows = await db
      .select()
      .from(media)
      .where(inArray(media.key, [keys.bucket, keys.bundled]))
    expect(rows.map((r) => [r.key, r.source, r.bytes, r.filename]).sort()).toEqual(
      [
        [keys.bucket, "bucket", 1234, "a.webp"],
        [keys.bundled, "bundled", 0, `${run}-0010-1.webp`],
      ].sort(),
    )
    expect(rows.find((r) => r.key === keys.bucket)?.alt).toEqual({ fr: "Vase" })
    const images = await db.select().from(productImages).where(eq(productImages.productId, ids.product))
    expect(images.every((i) => i.mediaId)).toBe(true)
    expect(images.filter((i) => i.isMain).map((i) => i.image)).toEqual([keys.bundled])
    expect(images.find((i) => i.alt === "Vase")?.altText).toEqual({ fr: "Vase" })
    expect(images.find((i) => i.alt === "  ")?.altText).toBeNull()
    expect(rows.find((r) => r.key === keys.bundled)?.alt).toBeNull()
    const [c] = await db.select().from(categories).where(eq(categories.id, ids.cat))
    expect(c?.imageMediaId).toBe(rows.find((r) => r.key === keys.bucket)!.id)
    const [l] = await db
      .select()
      .from(locations)
      .where(eq(locations.name, `loc-${run}`))
    expect(l?.imageMediaId).toBe(rows.find((r) => r.key === keys.bundled)!.id)
  })
})
