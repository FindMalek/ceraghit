import { categories, customRequests, type Db, locations, media, productImages, settings, uploads } from "@workspace/db"
import { and, eq, inArray, isNotNull, lte, sql } from "drizzle-orm"
import { MEDIA_REFERENCES, usageCountSql } from "./media"
import type { Storage } from "./storage"

/** The only upload folders the job may delete from. Anything else (labels, invoices, exports) is never touched. */
export const CLEANUP_FOLDERS = ["media", "products", "categories", "locations", "requests"] as const
const REQUEST_FOLDER = "requests"

/** Other features that keep files in an image folder register here so their keys are never deleted. */
export const STORAGE_REFERENCES: ((db: Db) => Promise<string[]>)[] = []

export interface CleanupOptions {
  now: Date
  /** Reports what would happen and writes nothing: no marks, no rows, no bucket calls. */
  dryRun?: boolean
  abandonedHours?: number
  unusedDays?: number
  warnDays?: number
  /** Most files deleted in one run, so a bug can never wipe the bucket. */
  batchSize?: number
}

export interface CleanupReport {
  dryRun: boolean
  checked: number
  marked: number
  restored: number
  abandonedDeleted: number
  unusedDeleted: number
  freedBytes: number
  warned: number
  errors: number
  items: { key: string; bytes: number; reason: "abandoned" | "unused" }[]
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

function collectS3Keys(value: unknown, out: Set<string>): void {
  if (typeof value === "string") {
    if (value.startsWith("s3:")) out.add(value.slice(3))
  } else if (Array.isArray(value)) {
    for (const v of value) collectS3Keys(v, out)
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectS3Keys(v, out)
  }
}

/**
 * Keys that something still shows, outside the media references (those are counted per file under a row lock): legacy
 * `s3:` strings, request photos, any `s3:` string in a setting, pinned media and the registered extra references.
 */
export async function protectedKeys(db: Db): Promise<Set<string>> {
  const [products, cats, locs, requests, pinned, setting, extra] = await Promise.all([
    db.select({ v: productImages.image }).from(productImages),
    db.select({ v: categories.image }).from(categories).where(isNotNull(categories.image)),
    db.select({ v: locations.image }).from(locations).where(isNotNull(locations.image)),
    db.select({ v: customRequests.images }).from(customRequests),
    db.select({ key: media.key }).from(media).where(eq(media.keep, true)),
    db.select({ v: settings.value }).from(settings),
    Promise.all(STORAGE_REFERENCES.map((fn) => fn(db))),
  ])
  const keys = new Set<string>()
  for (const v of [...products, ...cats, ...locs].map((r) => r.v)) collectS3Keys(v, keys)
  for (const r of requests) collectS3Keys(r.v, keys)
  for (const r of setting) collectS3Keys(r.v, keys)
  for (const r of pinned) keys.add(r.key)
  for (const list of extra) for (const k of list) keys.add(k.startsWith("s3:") ? k.slice(3) : k)
  return keys
}

interface Candidate {
  key: string
  bytes: number
  mediaId: string | null
  reason: "abandoned" | "unused"
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

/** Deletes the rows of one candidate if it is still deletable, re-checked under a row lock. True when it went. */
async function dropRows(tx: Tx, c: Candidate, cutoffs: { abandoned: Date; unused: Date }): Promise<boolean> {
  if (!c.mediaId) {
    const cutoff = c.reason === "abandoned" ? cutoffs.abandoned : cutoffs.unused
    const column = c.reason === "abandoned" ? uploads.createdAt : uploads.unusedSince
    const gone = await tx
      .delete(uploads)
      .where(
        and(
          eq(uploads.key, c.key),
          lte(column, cutoff),
          sql`not exists (select 1 from ${media} where ${media.key} = ${uploads.key})`,
        ),
      )
      .returning({ key: uploads.key })
    return gone.length > 0
  }
  const [row] = await tx.select().from(media).where(eq(media.id, c.mediaId)).for("update")
  if (!row || row.source !== "bucket" || row.keep || row.key !== c.key) return false
  const [used] = await tx.select({ n: usageCountSql() }).from(media).where(eq(media.id, row.id))
  if ((used?.n ?? 0) > 0) return false
  if (c.reason === "abandoned" ? row.confirmedAt !== null : !row.confirmedAt || !row.unusedSince) return false
  if (c.reason === "unused" && row.unusedSince! > cutoffs.unused) return false
  try {
    await tx.delete(media).where(eq(media.id, row.id))
  } catch {
    return false
  }
  await tx.delete(uploads).where(eq(uploads.key, row.key))
  return true
}

/**
 * Two tiers. Abandoned: an upload in an image folder that was never confirmed as media, gone after `abandonedHours`.
 * Unused: a library image nothing shows is marked, then deleted `unusedDays` after the mark (customer request photos
 * follow the same clock). Pinned, bundled, referenced and non-image-folder files are never deleted. Rows go in a
 * transaction per file that re-counts usage; the bucket object is removed only after it commits, and a failed removal
 * is logged and counted, the file is then an orphan that no row points to.
 */
export async function cleanupUploads(db: Db, storage: Storage, opts: CleanupOptions): Promise<CleanupReport> {
  const { now, dryRun = false } = opts
  const abandonedMs = (opts.abandonedHours ?? 48) * HOUR
  const unusedMs = (opts.unusedDays ?? 30) * DAY
  const warnMs = (opts.warnDays ?? 7) * DAY
  const cap = opts.batchSize ?? 200
  const cutoffs = {
    abandoned: new Date(now.getTime() - abandonedMs),
    unused: new Date(now.getTime() - unusedMs),
  }
  const report: CleanupReport = {
    dryRun,
    checked: 0,
    marked: 0,
    restored: 0,
    abandonedDeleted: 0,
    unusedDeleted: 0,
    freedBytes: 0,
    warned: 0,
    errors: 0,
    items: [],
  }
  const folders = [...CLEANUP_FOLDERS]
  const guarded = await protectedKeys(db)
  const planned: Candidate[] = []

  // Tier a: never confirmed uploads.
  const abandoned = await db
    .select({ key: uploads.key, bytes: uploads.bytes, mediaId: media.id, source: media.source })
    .from(uploads)
    .leftJoin(media, eq(media.key, uploads.key))
    .where(
      and(
        inArray(uploads.folder, folders),
        sql`${uploads.folder} <> ${REQUEST_FOLDER}`,
        lte(uploads.createdAt, cutoffs.abandoned),
        sql`${media.confirmedAt} is null`,
      ),
    )
    .orderBy(uploads.createdAt)
  for (const r of abandoned) {
    if (guarded.has(r.key) || (r.source && r.source !== "bucket")) continue
    planned.push({ key: r.key, bytes: r.bytes, mediaId: r.mediaId, reason: "abandoned" })
  }

  // Tier b: confirmed library media and request photos nothing shows.
  const library = await db
    .select({
      id: media.id,
      key: media.key,
      bytes: uploads.bytes,
      keep: media.keep,
      unusedSince: media.unusedSince,
      usage: usageCountSql(),
    })
    .from(media)
    .innerJoin(uploads, eq(uploads.key, media.key))
    .where(and(eq(media.source, "bucket"), isNotNull(media.confirmedAt), inArray(uploads.folder, folders)))
  const requestPhotos = await db
    .select({ key: uploads.key, bytes: uploads.bytes, unusedSince: uploads.unusedSince })
    .from(uploads)
    .where(
      and(
        eq(uploads.folder, REQUEST_FOLDER),
        sql`not exists (select 1 from ${media} where ${media.key} = ${uploads.key})`,
      ),
    )
  report.checked = library.length + requestPhotos.length + abandoned.length

  const mark: string[] = []
  const restoreMedia: string[] = []
  const markKeys: string[] = []
  const restoreKeys: string[] = []
  const unusedList = [
    ...library.map((r) => ({
      key: r.key,
      bytes: r.bytes,
      mediaId: r.id as string | null,
      unusedSince: r.unusedSince,
      free: !r.keep && r.usage === 0 && !guarded.has(r.key),
    })),
    ...requestPhotos.map((r) => ({
      key: r.key,
      bytes: r.bytes,
      mediaId: null as string | null,
      unusedSince: r.unusedSince,
      free: !guarded.has(r.key),
    })),
  ]
  const dueAt = (since: Date) => since.getTime() + unusedMs
  for (const r of unusedList) {
    if (!r.free) {
      if (r.unusedSince) {
        report.restored++
        if (r.mediaId) restoreMedia.push(r.mediaId)
        restoreKeys.push(r.key)
      }
    } else if (!r.unusedSince) {
      report.marked++
      if (r.mediaId) mark.push(r.mediaId)
      markKeys.push(r.key)
    } else if (dueAt(r.unusedSince) <= now.getTime()) {
      planned.push({ key: r.key, bytes: r.bytes, mediaId: r.mediaId, reason: "unused" })
    }
  }
  const deletingKeys = new Set(planned.slice(0, cap).map((c) => c.key))
  report.warned = unusedList.filter(
    (r) => r.free && r.unusedSince && !deletingKeys.has(r.key) && dueAt(r.unusedSince) - now.getTime() <= warnMs,
  ).length

  if (!dryRun) {
    if (markKeys.length) {
      if (mark.length) await db.update(media).set({ unusedSince: now }).where(inArray(media.id, mark))
      await db.update(uploads).set({ unusedSince: now }).where(inArray(uploads.key, markKeys))
    }
    if (restoreKeys.length) {
      if (restoreMedia.length) await db.update(media).set({ unusedSince: null }).where(inArray(media.id, restoreMedia))
      await db.update(uploads).set({ unusedSince: null }).where(inArray(uploads.key, restoreKeys))
    }
  }

  const removed: Candidate[] = []
  for (const c of planned.slice(0, cap)) {
    if (!dryRun && !(await db.transaction((tx) => dropRows(tx, c, cutoffs)))) continue
    removed.push(c)
    if (c.reason === "abandoned") report.abandonedDeleted++
    else report.unusedDeleted++
    report.items.push({ key: c.key, bytes: c.bytes, reason: c.reason })
  }
  for (const c of removed) {
    if (dryRun) {
      report.freedBytes += c.bytes
      continue
    }
    try {
      await storage.remove(c.key)
      report.freedBytes += c.bytes
    } catch (error) {
      report.errors++
      console.error(
        `[cleanup] remove failed ${c.key}`,
        error instanceof Error ? error.message.split("\n")[0] : "failed",
      )
    }
  }
  return report
}
