import { createHash } from "node:crypto"
import { ORPCError } from "@orpc/server"
import { categories, type Db, locations, media, productImages, products, uploads } from "@workspace/db"
import {
  MEDIA_CONTENT_TYPE,
  MEDIA_MAX_BYTES,
  MEDIA_MAX_SIDE,
  MEDIA_MIN_SIDE,
  type Media,
  type mediaListQuerySchema,
  type mediaSignResultSchema,
  type mediaSignSchema,
  mediaSrc,
  type mediaUpdateSchema,
  type mediaUsageSchema,
  readWebpSize,
  slugify,
} from "@workspace/sdk"
import { type AnyColumn, and, asc, desc, eq, getTableColumns, type SQL, sql } from "drizzle-orm"
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

type MediaRow = typeof media.$inferSelect

function toMedia(m: MediaRow, usageCount: number): Media {
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
    usageCount,
    unusedSince: m.unusedSince?.toISOString() ?? null,
    deletesAt:
      m.unusedSince && !m.keep ? new Date(m.unusedSince.getTime() + UNUSED_GRACE_DAYS * DAY).toISOString() : null,
    createdAt: m.createdAt.toISOString(),
  }
}

export async function getMedia(db: Db, id: string): Promise<Media | null> {
  const [row] = await db
    .select({ row: getTableColumns(media), usage: usageCountSql() })
    .from(media)
    .where(eq(media.id, id))
  return row ? toMedia(row.row, row.usage) : null
}

type MediaListQuery = z.output<typeof mediaListQuerySchema>
type MediaUpdate = z.output<typeof mediaUpdateSchema>
type MediaUsage = z.output<typeof mediaUsageSchema>

const likeEscape = (s: string) => s.replace(/[\\%_]/g, "\\$&")

/** Confirmed media only, filtered, sorted and paged; `id` breaks ties so pages never overlap. */
export async function listMedia(db: Db, query: MediaListQuery) {
  const usage = usageCountSql()
  const conds: (SQL | undefined)[] = [sql`${media.confirmedAt} is not null`]
  const q = query.q?.trim()
  if (q) {
    const slug = slugify(q)
    const raw = `%${likeEscape(q)}%`
    const matches: SQL[] = [
      sql`${media.alt}->>'fr' ilike ${raw}`,
      sql`${media.alt}->>'en' ilike ${raw}`,
      sql`${media.alt}->>'ar' ilike ${raw}`,
      sql`${media.originalName} ilike ${raw}`,
      sql`exists (select 1 from unnest(${media.tags}) t where t ilike ${raw})`,
    ]
    // Slugifying drops other scripts (Arabic), which would leave a stray fragment matching unrelated names.
    if (slug && /^[\p{Script=Latin}\p{N}\s._-]+$/u.test(q)) matches.push(sql`${media.filename} ilike ${`%${slug}%`}`)
    conds.push(sql`(${sql.join(matches, sql` or `)})`)
  }
  if (query.unused) conds.push(sql`${usage} = 0`)
  if (query.tag) conds.push(sql`${media.tags} @> array[${query.tag.toLowerCase()}]::text[]`)
  const where = and(...conds)

  const order = {
    newest: [desc(media.createdAt)],
    oldest: [asc(media.createdAt)],
    name: [asc(media.filename)],
    size: [desc(media.bytes)],
    usage: [desc(usage), desc(media.createdAt)],
  }[query.sort]

  const [rows, [count]] = await Promise.all([
    db
      .select({ row: getTableColumns(media), usage })
      .from(media)
      .where(where)
      .orderBy(...order, asc(media.id))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ n: sql<number>`count(*)::int` }).from(media).where(where),
  ])
  const total = count?.n ?? 0
  const next = query.offset + rows.length
  return {
    items: rows.map((r) => toMedia(r.row, r.usage)),
    total,
    nextOffset: next < total ? next : null,
  }
}

/** Every place the picture is shown, one entry per owner. */
export async function mediaUsage(db: Db, id: string): Promise<MediaUsage[]> {
  const out: MediaUsage[] = []
  for (const ref of MEDIA_REFERENCES) {
    if (ref.kind === "product") {
      const rows = await db
        .selectDistinct({ id: products.id, ref: products.ref, title: products.title })
        .from(productImages)
        .innerJoin(products, eq(products.id, productImages.productId))
        .where(eq(productImages.mediaId, id))
      for (const r of rows)
        out.push({ kind: "product", id: r.id, label: `${r.title.fr} (${r.ref})`, href: `/products/${r.id}` })
    } else if (ref.kind === "category") {
      const rows = await db
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(eq(categories.imageMediaId, id))
      for (const r of rows) out.push({ kind: "category", id: r.id, label: r.name.fr, href: "/categories" })
    } else {
      const rows = await db
        .select({ id: locations.id, name: locations.name })
        .from(locations)
        .where(eq(locations.imageMediaId, id))
      for (const r of rows) out.push({ kind: "location", id: r.id, label: r.name, href: "/locations" })
    }
  }
  return out
}

async function getMediaOrThrow(db: Db, id: string): Promise<Media> {
  const found = await getMedia(db, id)
  if (!found) throw new ORPCError("NOT_FOUND", { message: "Media not found." })
  return found
}

export async function getMediaDetail(db: Db, id: string) {
  const found = await getMedia(db, id)
  if (!found) throw new ORPCError("NOT_FOUND", { message: "Media not found." })
  return { ...found, usage: await mediaUsage(db, id) }
}

/** A rename only changes the display and download name: the bucket key stays, so every URL keeps working. */
export async function updateMedia(db: Db, input: MediaUpdate): Promise<Media> {
  const set: Partial<typeof media.$inferInsert> = {}
  if (input.filename !== undefined) {
    const base = slugify(input.filename.replace(/\.webp$/i, ""))
    if (!base) throw new ORPCError("BAD_REQUEST", { message: "Invalid file name." })
    set.filename = `${base}.webp`
  }
  if (input.alt !== undefined) set.alt = input.alt
  if (input.tags !== undefined) set.tags = [...new Set(input.tags)].sort()
  if (input.keep !== undefined) set.keep = input.keep
  if (Object.keys(set).length === 0) return getMediaOrThrow(db, input.id)
  const [row] = await db
    .update(media)
    .set(set)
    .where(and(eq(media.id, input.id), sql`${media.confirmedAt} is not null`))
    .returning({ id: media.id })
  if (!row) throw new ORPCError("NOT_FOUND", { message: "Media not found." })
  return (await getMedia(db, input.id)) as Media
}

const IN_USE = "This image is still in use."

/** Deletes an unused bucket image: the object goes after the rows are committed. */
export async function removeMedia(db: Db, storage: Storage | null, id: string): Promise<void> {
  const key = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(media).where(eq(media.id, id)).for("update")
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Media not found." })
    if (row.source !== "bucket")
      throw new ORPCError("BAD_REQUEST", { message: "This image ships with the site and cannot be deleted." })
    const [used] = await tx.select({ n: usageCountSql() }).from(media).where(eq(media.id, id))
    if ((used?.n ?? 0) > 0) throw new ORPCError("CONFLICT", { message: IN_USE })
    try {
      await tx.delete(media).where(eq(media.id, id))
    } catch {
      // A reference attached since the count: the foreign key refused the delete.
      throw new ORPCError("CONFLICT", { message: IN_USE })
    }
    await tx.delete(uploads).where(eq(uploads.key, row.key))
    return row.key
  })
  try {
    await storage?.remove(key)
  } catch (error) {
    console.error(`[media ${id}] object not removed, cleanup will take it`, error)
  }
}

export async function mediaTags(db: Db): Promise<{ tag: string; count: number }[]> {
  const rows = await db.execute<{ tag: string; count: number }>(
    sql`select t as tag, count(*)::int as count from ${media}, unnest(${media.tags}) t where ${media.confirmedAt} is not null group by t order by count desc, t asc`,
  )
  return [...rows].map((r) => ({ tag: r.tag, count: r.count }))
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
