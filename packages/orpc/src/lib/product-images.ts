import { ORPCError } from "@orpc/server"
import type { Db } from "@workspace/db"
import { media, productImages } from "@workspace/db"
import { mediaSrc, type ProductInput } from "@workspace/sdk"
import { and, inArray, isNotNull } from "drizzle-orm"

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

/**
 * Replaces a product's photos in the caller's transaction: positions are dense, one photo is main (the first when
 * none is flagged). The old rows go first, so the partial unique index on the main photo never sees two.
 * The legacy `image` and `alt` columns stay filled for readers that still use them.
 */
export async function saveProductImages(tx: Tx, productId: string, images: ProductInput["images"]): Promise<void> {
  const rows = images.length
    ? await tx
        .select()
        .from(media)
        .where(and(inArray(media.id, [...new Set(images.map((i) => i.mediaId))]), isNotNull(media.confirmedAt)))
    : []
  const byId = new Map(rows.map((m) => [m.id, m]))
  if (images.some((i) => !byId.has(i.mediaId)))
    throw new ORPCError("BAD_REQUEST", { message: "A photo is no longer available." })
  await tx.delete(productImages).where(inArray(productImages.productId, [productId]))
  if (!images.length) return
  const main = Math.max(
    0,
    images.findIndex((i) => i.isMain),
  )
  await tx.insert(productImages).values(
    images.map((img, position) => {
      const m = byId.get(img.mediaId)!
      return {
        productId,
        mediaId: m.id,
        image: mediaSrc(m),
        alt: img.alt?.fr ?? null,
        altText: img.alt ?? null,
        isMain: position === main,
        position,
      }
    }),
  )
}
