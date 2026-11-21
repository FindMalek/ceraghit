import { type Db, uploads } from "@workspace/db"
import { STORAGE_QUOTA_BYTES, STORAGE_WARN_RATIO, type StorageLevel } from "@workspace/sdk"
import { sql } from "drizzle-orm"
import { publicError } from "../errors"
import { recordStorageBytes } from "./metrics"

export async function storageUsage(db: Db) {
  const [row] = await db
    .select({ usedBytes: sql<number>`coalesce(sum(${uploads.bytes}), 0)::bigint`, files: sql<number>`count(*)::int` })
    .from(uploads)
  const usedBytes = Number(row?.usedBytes ?? 0)
  recordStorageBytes(usedBytes)
  const ratio = usedBytes / STORAGE_QUOTA_BYTES
  const level: StorageLevel = ratio >= 1 ? "full" : ratio >= STORAGE_WARN_RATIO ? "warn" : "ok"
  return {
    usedBytes,
    quotaBytes: STORAGE_QUOTA_BYTES,
    files: row?.files ?? 0,
    percent: Math.floor(ratio * 100),
    level,
  }
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
