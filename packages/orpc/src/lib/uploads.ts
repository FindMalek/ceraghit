import { ORPCError } from "@orpc/server"
import { categories, customRequests, type Db, locations, productImages, uploads } from "@workspace/db"
import { STORAGE_QUOTA_BYTES } from "@workspace/sdk"
import { eq, isNotNull, sql } from "drizzle-orm"
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
    throw new ORPCError("PAYLOAD_TOO_LARGE", { message: "The storage space is full." })
  }
  await db.insert(uploads).values(file).onConflictDoNothing()
}

/** `s3:<key>` values that something still shows: product, category and location images and customer request photos. */
async function referencedKeys(db: Db): Promise<Set<string>> {
  const [fromProducts, fromCategories, fromLocations, fromRequests] = await Promise.all([
    db.select({ v: productImages.image }).from(productImages),
    db.select({ v: categories.image }).from(categories).where(isNotNull(categories.image)),
    db.select({ v: locations.image }).from(locations).where(isNotNull(locations.image)),
    db.select({ v: customRequests.images }).from(customRequests),
  ])
  const values = [
    ...fromProducts.map((r) => r.v),
    ...fromCategories.map((r) => r.v),
    ...fromLocations.map((r) => r.v),
    ...fromRequests.flatMap((r) => r.v),
  ]
  return new Set(values.filter((v): v is string => typeof v === "string" && v.startsWith("s3:")).map((v) => v.slice(3)))
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
