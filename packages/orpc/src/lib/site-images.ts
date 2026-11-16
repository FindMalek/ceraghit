import { ORPCError } from "@orpc/server"
import { type Db, media, siteImages } from "@workspace/db"
import {
  DEFAULT_SITE_IMAGES,
  DEFAULT_SITE_SIZES,
  mediaSrc,
  type publicSiteImagesSchema,
  SITE_SLOT_KEYS,
  SITE_SLOTS,
  type SiteSlotInput,
  type siteImageSchema,
  type siteImagesSchema,
} from "@workspace/sdk"
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm"
import type { z } from "zod"

type AdminImages = z.output<typeof siteImagesSchema>
type PublicImages = z.output<typeof publicSiteImagesSchema>

async function readRows(db: Db, includeHidden: boolean) {
  const rows = await db
    .select({ row: siteImages, media })
    .from(siteImages)
    .innerJoin(media, eq(media.id, siteImages.mediaId))
    .where(includeHidden ? undefined : eq(siteImages.visible, true))
    .orderBy(asc(siteImages.slot), asc(siteImages.position), asc(siteImages.id))
  return rows
}

/** Every slot, ordered, with hidden entries when asked. */
export async function getSiteImages(db: Db): Promise<AdminImages> {
  const out = Object.fromEntries(
    SITE_SLOT_KEYS.map((k) => [k, [] as z.output<typeof siteImageSchema>[]]),
  ) as AdminImages
  for (const { row, media: m } of await readRows(db, true))
    out[row.slot].push({
      id: row.id,
      slot: row.slot,
      mediaId: row.mediaId,
      image: mediaSrc(m),
      alt: row.alt,
      visible: row.visible,
      position: row.position,
      width: m.width,
      height: m.height,
    })
  return out
}

/** Visible entries only; an empty slot answers with the bundled default so the storefront never breaks. */
export async function getPublicSiteImages(db: Db): Promise<PublicImages> {
  const out = Object.fromEntries(SITE_SLOT_KEYS.map((k) => [k, [] as PublicImages[typeof k]])) as PublicImages
  for (const { row, media: m } of await readRows(db, false))
    out[row.slot].push({ image: mediaSrc(m), alt: row.alt ?? m.alt, width: m.width, height: m.height })
  for (const slot of SITE_SLOT_KEYS)
    if (out[slot].length === 0)
      out[slot] = DEFAULT_SITE_IMAGES[slot].map((image) => ({
        image,
        alt: null,
        width: DEFAULT_SITE_SIZES[image]?.width ?? null,
        height: DEFAULT_SITE_SIZES[image]?.height ?? null,
      }))
  return out
}

/** Replaces the whole slot in one transaction, position = index. */
export async function saveSlot(db: Db, input: SiteSlotInput): Promise<void> {
  const rule = SITE_SLOTS[input.slot]
  if (input.images.length > rule.max) throw new ORPCError("BAD_REQUEST", { message: "Too many images for this slot." })
  if (input.images.filter((i) => i.visible).length < rule.min)
    throw new ORPCError("BAD_REQUEST", { message: "This slot needs at least one visible image." })
  const ids = [...new Set(input.images.map((i) => i.mediaId))]
  await db.transaction(async (tx) => {
    // Lock the picked media so a parallel delete cannot slip between the check and the insert.
    const found = ids.length
      ? await tx
          .select({ id: media.id })
          .from(media)
          .where(and(inArray(media.id, ids), isNotNull(media.confirmedAt)))
          .for("share")
      : []
    if (found.length !== ids.length) throw new ORPCError("BAD_REQUEST", { message: "A photo is no longer available." })
    await tx.delete(siteImages).where(eq(siteImages.slot, input.slot))
    if (input.images.length)
      await tx.insert(siteImages).values(
        input.images.map((i, position) => ({
          slot: input.slot,
          mediaId: i.mediaId,
          position,
          alt: i.alt ?? null,
          visible: i.visible,
        })),
      )
  })
}
