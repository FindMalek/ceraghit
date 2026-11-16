import { createHash } from "node:crypto"
import { ORPCError } from "@orpc/server"
import { categories, type Db, locations, media, productImages, uploads } from "@workspace/db"
import {
  MEDIA_CONTENT_TYPE,
  MEDIA_MAX_BYTES,
  MEDIA_MAX_SIDE,
  MEDIA_MIN_SIDE,
  type Media,
  type mediaSignResultSchema,
  type mediaSignSchema,
  mediaSrc,
  readWebpSize,
  slugify,
} from "@workspace/sdk"
import { type AnyColumn, eq, getTableColumns, sql } from "drizzle-orm"
import type { PgTable } from "drizzle-orm/pg-core"
import type { z } from "zod"
import { type Storage, TOO_LARGE } from "./storage"
import { reserveUpload } from "./uploads"

type MediaSignInput = z.output<typeof mediaSignSchema>
type MediaSignResult = z.output<typeof mediaSignResultSchema>

export interface MediaReference {
  table: PgTable
  column: AnyColumn
  kind: "product" | "category" | "location"
}

/** Every foreign key to `media.id`. Usage counts, the delete guard and cleanup all read this list. */
export const MEDIA_REFERENCES: readonly MediaReference[] = [
  { table: productImages, column: productImages.mediaId, kind: "product" },
  { table: categories, column: categories.imageMediaId, kind: "category" },
  { table: locations, column: locations.imageMediaId, kind: "location" },
]

/** `(select count(*) ...) + ...` of the pictures' references, for a query on `media`. */
export function usageCountSql() {
  const counts = MEDIA_REFERENCES.map((r) => sql`(select count(*) from ${r.table} where ${r.column} = ${media.id})`)
  return sql<number>`(${sql.join(counts, sql` + `)})::int`
}

const DAY = 86_400_000
const UNUSED_GRACE_DAYS = 30

export async function getMedia(db: Db, id: string): Promise<Media | null> {
  const [row] = await db
    .select({ row: getTableColumns(media), usage: usageCountSql() })
    .from(media)
    .where(eq(media.id, id))
  if (!row) return null
  const { row: m } = row
  return {
    id: m.id,
    key: m.key,
    src: mediaSrc(m),
    filename: m.filename,
    originalName: m.originalName,
    mime: m.mime,
    bytes: m.bytes,
    width: m.width,
    height: m.height,
    alt: m.alt,
    tags: m.tags,
    source: m.source,
    keep: m.keep,
    usageCount: row.usage,
    unusedSince: m.unusedSince?.toISOString() ?? null,
    deletesAt:
      m.unusedSince && !m.keep ? new Date(m.unusedSince.getTime() + UNUSED_GRACE_DAYS * DAY).toISOString() : null,
    createdAt: m.createdAt.toISOString(),
  }
}

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz"

function shortId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => BASE36[b % 36]).join("")
}

/** `<prefix>media/<slug>-<6 chars>.webp`: readable, and never the visitor's own path or extension. */
export function mediaKey(prefix: string, originalName: string): { key: string; filename: string } {
  const base = originalName.split(/[\\/]/).pop() ?? ""
  const slug =
    slugify(base.replace(/\.[^.]*$/, ""))
      .slice(0, 60)
      .replace(/-+$/, "") || "image"
  return { key: `${prefix}media/${slug}-${shortId()}.webp`, filename: `${slug}.webp` }
}

const REJECTED = "Only compressed WebP images are accepted."

async function dropMedia(db: Db, storage: Storage, row: { id: string; key: string }): Promise<void> {
  await storage.remove(row.key)
  await db.delete(media).where(eq(media.id, row.id))
  await db.delete(uploads).where(eq(uploads.key, row.key))
}

/** An existing confirmed image for this hash, or a presigned upload for a new one. */
export async function signMedia(
  db: Db,
  storage: Storage,
  input: MediaSignInput,
  attempt = 1,
): Promise<MediaSignResult> {
  const [found] = await db.select().from(media).where(eq(media.hash, input.hash))
  if (found?.confirmedAt) {
    const existing = await getMedia(db, found.id)
    if (existing) return { status: "existing", media: existing }
  }
  if (found) await dropMedia(db, storage, found)

  const { key, filename } = mediaKey(storage.prefix, input.originalName)
  await reserveUpload(db, { key, folder: "media", contentType: MEDIA_CONTENT_TYPE, bytes: input.size })
  const [row] = await db
    .insert(media)
    .values({
      key,
      source: "bucket",
      filename,
      originalName: input.originalName,
      mime: MEDIA_CONTENT_TYPE,
      bytes: input.size,
      width: input.width,
      height: input.height,
      hash: input.hash,
      tags: input.tags,
    })
    .onConflictDoNothing({ target: media.hash })
    .returning({ id: media.id })
  if (!row) {
    // Lost a race with a parallel sign of the same bytes.
    await db.delete(uploads).where(eq(uploads.key, key))
    if (attempt >= 2) throw new ORPCError("CONFLICT", { message: "Upload already in progress, try again." })
    return signMedia(db, storage, input, attempt + 1)
  }
  return { status: "upload", mediaId: row.id, uploadUrl: await storage.presignPut(key, MEDIA_CONTENT_TYPE, input.size) }
}

/** Reads the stored object and only then makes the media usable; any mismatch removes the object and the rows. */
export async function confirmMedia(db: Db, storage: Storage, id: string): Promise<Media> {
  const [row] = await db.select().from(media).where(eq(media.id, id))
  if (!row) throw new ORPCError("NOT_FOUND", { message: "Media not found." })
  if (row.confirmedAt) return (await getMedia(db, id)) as Media

  const reject = async (): Promise<never> => {
    await dropMedia(db, storage, row)
    throw new ORPCError("BAD_REQUEST", { message: REJECTED })
  }
  let bytes: Uint8Array | null = null
  try {
    bytes = await storage.read(row.key, MEDIA_MAX_BYTES)
  } catch (error) {
    // Past the byte cap is a real mismatch; anything else (network, bucket error) may pass on a retry.
    if (error instanceof Error && error.message === TOO_LARGE) return reject()
    throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Could not check the upload, try again." })
  }
  if (!bytes) throw new ORPCError("CONFLICT", { message: "The upload has not arrived yet, try again." })
  const size = readWebpSize(bytes)
  const valid =
    size !== null &&
    size.width >= MEDIA_MIN_SIDE &&
    size.height >= MEDIA_MIN_SIDE &&
    size.width <= MEDIA_MAX_SIDE &&
    size.height <= MEDIA_MAX_SIDE &&
    size.width === row.width &&
    size.height === row.height &&
    bytes.length === row.bytes &&
    createHash("sha256").update(bytes).digest("hex") === row.hash
  if (!valid) return reject()

  await db.update(media).set({ confirmedAt: new Date() }).where(eq(media.id, id))
  return (await getMedia(db, id)) as Media
}
