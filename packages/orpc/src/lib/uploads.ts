import { categories, customRequests, type Db, locations, media, productImages, uploads } from "@workspace/db"
import { STORAGE_QUOTA_BYTES } from "@workspace/sdk"
import { and, eq, exists, isNotNull, or, sql } from "drizzle-orm"
import { publicError } from "../errors"
import { MEDIA_REFERENCES } from "./media"
import type { Storage } from "./storage"

export async function storageUsage(db: Db) {
  const [row] = await db
    .select({ usedBytes: sql<number>`coalesce(sum(${uploads.bytes}), 0)::bigint`, files: sql<number>`count(*)::int` })
    .from(uploads)
  return { usedBytes: Number(row?.usedBytes ?? 0), quotaBytes: STORAGE_QUOTA_BYTES, files: row?.files ?? 0 }
}

/** Refuses an upload that would go past the plan, then remembers it so the counter includes it. */
export async function reserveUpload(
  db: Db,
  file: { key: string; folder: string; contentType: string; bytes: number },
): Promise<void> {
  const { usedBytes } = await storageUsage(db)
  if (usedBytes + file.bytes > STORAGE_QUOTA_BYTES) {
    throw publicError("PAYLOAD_TOO_LARGE", "storage_full", "The storage space is full.")
  }
  await db.insert(uploads).values(file).onConflictDoNothing()
}

/**
 * Bucket keys that something still shows: the legacy `s3:` strings of product, category and location images, customer
 * request photos, bucket media referenced by id through `MEDIA_REFERENCES`, and every media the owner pinned (`keep`).
 */
async function referencedKeys(db: Db): Promise<Set<string>> {
  const referenced = or(
    eq(media.keep, true),
    ...MEDIA_REFERENCES.map((r) => exists(db.select({ one: sql`1` }).from(r.table).where(eq(r.column, media.id)))),
  )
  const [fromProducts, fromCategories, fromLocations, fromRequests, fromMedia] = await Promise.all([
    db.select({ v: productImages.image }).from(productImages),
    db.select({ v: categories.image }).from(categories).where(isNotNull(categories.image)),
    db.select({ v: locations.image }).from(locations).where(isNotNull(locations.image)),
    db.select({ v: customRequests.images }).from(customRequests),
    db
      .select({ key: media.key })
      .from(media)
      .where(and(eq(media.source, "bucket"), referenced)),
  ])
  const values = [
    ...fromProducts.map((r) => r.v),
    ...fromCategories.map((r) => r.v),
    ...fromLocations.map((r) => r.v),
    ...fromRequests.flatMap((r) => r.v),
  ]
  const keys = values.filter((v): v is string => typeof v === "string" && v.startsWith("s3:")).map((v) => v.slice(3))
  return new Set([...keys, ...fromMedia.map((r) => r.key)])
}

const DAY = 86_400_000

/**
 * Daily job. A file nothing references is marked unused the first time it is seen, and deleted from the bucket and the
 * counter once it has stayed unused for `graceDays`. A file used again is unmarked.
 */
export async function cleanupUploads(db: Db, storage: Storage, now: Date, graceDays = 30) {
  const used = await referencedKeys(db)
  const rows = await db.select().from(uploads)
  const result = { checked: rows.length, marked: 0, restored: 0, deleted: 0, freedBytes: 0 }
  for (const row of rows) {
    if (used.has(row.key)) {
      if (row.unusedSince) {
        await db.update(uploads).set({ unusedSince: null }).where(eq(uploads.key, row.key))
        result.restored++
      }
    } else if (!row.unusedSince) {
      await db.update(uploads).set({ unusedSince: now }).where(eq(uploads.key, row.key))
      result.marked++
    } else if (now.getTime() - row.unusedSince.getTime() >= graceDays * DAY) {
      await storage.remove(row.key)
      await db.delete(uploads).where(eq(uploads.key, row.key))
      result.deleted++
      result.freedBytes += row.bytes
    }
  }
  return result
}
