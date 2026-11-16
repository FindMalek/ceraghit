import { type Db, uploads } from "@workspace/db"
import { STORAGE_QUOTA_BYTES } from "@workspace/sdk"
import { sql } from "drizzle-orm"
import { publicError } from "../errors"

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
