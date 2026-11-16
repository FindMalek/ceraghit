import { DEFAULT_SITE_IMAGES, DEFAULT_SITE_SIZES, SITE_SLOT_KEYS } from "@workspace/sdk"
import { count } from "drizzle-orm"
import type { Db } from "../index"
import type { Localized } from "../schema"
import { media, siteImages } from "../schema"

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
