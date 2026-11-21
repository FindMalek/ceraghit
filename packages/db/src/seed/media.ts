import { DEFAULT_SITE_IMAGES, DEFAULT_SITE_SIZES, SITE_SLOT_KEYS } from "@workspace/sdk"
import { and, count, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm"
import type { Db } from "../index"
import type { Localized } from "../schema"
import { categories, locations, media, productImages, siteImages } from "../schema"
import { BUNDLED_MEDIA } from "./bundled-media"

interface DemoMedia {
  alt: Localized
  tags: string[]
}

/** Demo alt text and tags, by the product ref whose first picture they describe. */
export const DEMO_MEDIA_BY_REF: Record<string, DemoMedia> = {
  "0010": { alt: { fr: "Curda Seca", en: "Curda Seca piece", ar: "قطعة كوردا سيكا" }, tags: ["curda-seca"] },
  "0200": { alt: { fr: "Lampe votive", en: "Votive lamp", ar: "مصباح نذري" }, tags: ["lampe"] },
  "0201": { alt: { fr: "Lampe votive", en: "Votive lamp", ar: "مصباح نذري" }, tags: ["lampe"] },
  "0050": { alt: { fr: "Medusa en bas-relief", en: "Medusa bas-relief", ar: "ميدوزا نحت بارز" }, tags: ["bas-relief"] },
  "0002": {
    alt: { fr: "Fontaine andalouse", en: "Andalusian fountain", ar: "نافورة أندلسية" },
    tags: ["haut-relief"],
  },
}

/** A bundled picture seeded as a hidden hero slide, so the dashboard can exercise the visible toggle. */
export const DEMO_HIDDEN_HERO = "/catalogue/0002-1.webp"

/** A picture uploaded but not attached to anything, so the "unused" filter has something to show. */
export const DEMO_UNUSED_MEDIA = {
  key: "demo/media/atelier-inutilise.webp",
  filename: "atelier-inutilise.webp",
  alt: { fr: "Atelier", en: "Studio", ar: "الورشة" } as Localized,
  tags: ["atelier"],
}

/** Demo piece whose main photo is its second one, to show that the main photo comes first on the storefront. */
export const DEMO_MAIN_SECOND_REF = "0011"

/**
 * Fills `site_images` with the pictures the storefront ships with, only while the table is empty: once the owner
 * edits a slot (even to remove everything) his rows win. Runs on every deploy.
 */
export async function ensureSiteImages(db: Db, opts: { demo?: boolean } = {}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ n: count() }).from(siteImages)
    if ((existing?.n ?? 0) > 0) return false
    const entries = SITE_SLOT_KEYS.flatMap((slot) =>
      DEFAULT_SITE_IMAGES[slot].map((key, position) => ({ slot, key, position, visible: true })),
    )
    if (opts.demo)
      entries.push({ slot: "hero", key: DEMO_HIDDEN_HERO, position: DEFAULT_SITE_IMAGES.hero.length, visible: false })
    const keys = [...new Set(entries.map((e) => e.key))]
    await tx
      .insert(media)
      .values(
        keys.map((key) => ({
          key,
          source: "bundled" as const,
          filename: key.split("/").pop() ?? "image.webp",
          confirmedAt: new Date(),
          ...DEFAULT_SITE_SIZES[key],
        })),
      )
      .onConflictDoNothing({ target: media.key })
    const rows = await tx.select({ id: media.id, key: media.key }).from(media)
    const idByKey = new Map(rows.map((r) => [r.key, r.id]))
    await tx
      .insert(siteImages)
      .values(
        entries.map((e) => ({ slot: e.slot, mediaId: idByKey.get(e.key)!, position: e.position, visible: e.visible })),
      )
    return true
  })
}

/**
 * Makes every picture shipped with the web app a `media` row and links the rows that reference it. A row that already
 * exists only gets its missing size and hash filled: filename, alt, tags and keep belong to the owner. Runs on every deploy.
 */
export async function syncBundledMedia(db: Db): Promise<{ inserted: number; updated: number }> {
  const keys = BUNDLED_MEDIA.map((m) => m.key)
  const existing = new Map(
    (await db.select().from(media).where(inArray(media.key, keys))).map((row) => [row.key, row] as const),
  )
  const takenHashes = new Set(
    (await db.select({ hash: media.hash }).from(media).where(isNotNull(media.hash))).map((r) => r.hash),
  )
  let inserted = 0
  let updated = 0
  for (const m of BUNDLED_MEDIA) {
    try {
      const row = existing.get(m.key)
      const hashFree = !takenHashes.has(m.hash)
      if (!row) {
        if (!hashFree) console.warn(`media: ${m.key} has the same bytes as another picture, stored without hash`)
        const { hash, ...rest } = m
        await db
          .insert(media)
          .values({ ...rest, hash: hashFree ? hash : null, source: "bundled", confirmedAt: new Date() })
        if (hashFree) takenHashes.add(hash)
        inserted++
        continue
      }
      // Size, dimensions and hash describe the bundled file, not the owner's choices (alt, filename, tags, keep stay
      // theirs): they follow the manifest, so a database seeded with older values is brought up to date.
      const set: Partial<typeof media.$inferInsert> = {}
      if (row.bytes !== m.bytes) set.bytes = m.bytes
      if (row.width !== m.width) set.width = m.width
      if (row.height !== m.height) set.height = m.height
      if (row.hash !== m.hash && hashFree) {
        set.hash = m.hash
        takenHashes.add(m.hash)
      }
      if (Object.keys(set).length === 0) continue
      await db.update(media).set(set).where(eq(media.id, row.id))
      updated++
    } catch (error) {
      console.warn(`media: ${m.key} skipped`, error instanceof Error ? error.message : error)
    }
  }
  const idByKey = (key: typeof productImages.image | typeof categories.image | typeof locations.image) =>
    sql`(select ${media.id} from ${media} where ${media.key} = ${key})`
  await db
    .update(productImages)
    .set({ mediaId: idByKey(productImages.image) })
    .where(and(isNull(productImages.mediaId), inArray(productImages.image, keys)))
  await db
    .update(categories)
    .set({ imageMediaId: idByKey(categories.image) })
    .where(and(isNull(categories.imageMediaId), inArray(categories.image, keys)))
  await db
    .update(locations)
    .set({ imageMediaId: idByKey(locations.image) })
    .where(and(isNull(locations.imageMediaId), inArray(locations.image, keys)))
  await db.execute(sql`
    update product_images set is_main = true where id in (
      select distinct on (p.product_id) p.id from product_images p
      where not exists (select 1 from product_images m where m.product_id = p.product_id and m.is_main)
      order by p.product_id, p.position, p.id
    )`)
  if (inserted || updated) console.info(`media: ${inserted} inserted, ${updated} updated`)
  return { inserted, updated }
}
