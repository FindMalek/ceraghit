import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createDb, media, uploads } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { STORAGE_QUOTA_BYTES } from "@workspace/sdk"
import { eq, like } from "drizzle-orm"
import { reconcileStorage } from "../src/lib/cleanup"
import type { Storage } from "../src/lib/storage"
import { storageUsage } from "../src/lib/uploads"

const url = process.env.DATABASE_URL
const HOUR = 3_600_000

describe.skipIf(!url)("storage reconcile", () => {
  const db = createDb(url!)
  const run = crypto.randomUUID().slice(0, 8)
  const prefix = `pr-${run}/`
  const now = new Date("2031-03-01T12:00:00Z")
  const ago = (hours: number) => new Date(now.getTime() - hours * HOUR)
  let objects: { key: string; size: number; modifiedAt: Date }[] = []
  let removed: string[] = []
  const storage = {
    prefix,
    list: async () => objects,
    remove: async (key: string) => {
      removed.push(key)
      objects = objects.filter((o) => o.key !== key)
    },
  } as unknown as Storage
  const key = (path: string) => `${prefix}${path}`
  const rows = () =>
    db
      .select()
      .from(uploads)
      .where(like(uploads.key, `${prefix}%`))

  beforeAll(() => runMigrations(db))
  afterAll(async () => {
    await db.delete(media).where(like(media.key, `${prefix}%`))
    await db.delete(uploads).where(like(uploads.key, `${prefix}%`))
  })

  test("the counter matches the bucket: zombies go, unknown files count, ghost rows and wrong sizes are fixed", async () => {
    await db.insert(uploads).values([
      { key: key("media/ok.webp"), folder: "media", contentType: "image/webp", bytes: 1000, createdAt: ago(100) },
      { key: key("media/grew.webp"), folder: "media", contentType: "image/webp", bytes: 500, createdAt: ago(100) },
      { key: key("media/ghost.webp"), folder: "media", contentType: "image/webp", bytes: 700, createdAt: ago(5) },
      { key: key("media/signed.webp"), folder: "media", contentType: "image/webp", bytes: 300, createdAt: ago(0.5) },
    ])
    await db.insert(media).values({ key: key("media/ghost.webp"), filename: "ghost.webp" })
    objects = [
      { key: key("media/ok.webp"), size: 1000, modifiedAt: ago(100) },
      { key: key("media/grew.webp"), size: 800, modifiedAt: ago(100) },
      { key: key("media/zombie.webp"), size: 400, modifiedAt: ago(72) },
      { key: key("media/fresh.webp"), size: 400, modifiedAt: ago(2) },
      { key: key("private/labels/a.pdf"), size: 2000, modifiedAt: ago(1) },
    ]
    removed = []

    const dry = await reconcileStorage(db, storage, { now, dryRun: true })
    expect(dry).toMatchObject({ orphansDeleted: 1, rowsDropped: 1, sizesFixed: 1, missingRows: 1 })
    expect(removed).toEqual([])
    expect(await rows()).toHaveLength(4)

    const report = await reconcileStorage(db, storage, { now })
    expect(report).toMatchObject({
      listed: 5,
      missingRows: 1,
      orphansDeleted: 1,
      rowsDropped: 1,
      sizesFixed: 1,
      errors: 0,
    })
    expect(report.driftBytesBefore).toBeGreaterThan(0)
    expect(report.driftBytesAfter).toBe(100)
    expect(removed).toEqual([key("media/zombie.webp")])
    const after = Object.fromEntries((await rows()).map((r) => [r.key.slice(prefix.length), r.bytes]))
    expect(after).toEqual({
      "media/ok.webp": 1000,
      "media/grew.webp": 800,
      "media/signed.webp": 300,
      "private/labels/a.pdf": 2000,
    })
    expect(
      await db
        .select()
        .from(media)
        .where(eq(media.key, key("media/ghost.webp"))),
    ).toHaveLength(0)

    removed = []
    expect(await reconcileStorage(db, storage, { now })).toMatchObject({
      missingRows: 0,
      orphansDeleted: 0,
      rowsDropped: 0,
      sizesFixed: 0,
    })
  })

  test("an empty listing while rows exist is a failed listing and changes nothing", async () => {
    objects = []
    const before = await rows()
    const report = await reconcileStorage(db, storage, { now })
    expect(report).toMatchObject({ listed: 0, rowsDropped: 0, orphansDeleted: 0 })
    expect(await rows()).toHaveLength(before.length)
  })

  test("usage turns to warn at 80% and full at 100%", async () => {
    const rollback = new Error("rollback")
    const level = async (share: number) => {
      let seen = "" as string
      await db
        .transaction(async (tx) => {
          const base = (await storageUsage(tx as unknown as typeof db)).usedBytes
          const missing = Math.ceil(STORAGE_QUOTA_BYTES * share) - base
          const chunks = Math.ceil(missing / 1_000_000_000)
          await tx.insert(uploads).values(
            Array.from({ length: chunks }, (_, i) => ({
              key: `${prefix}media/level-${share}-${i}.webp`,
              folder: "media",
              contentType: "image/webp",
              bytes: Math.ceil(missing / chunks),
            })),
          )
          const usage = await storageUsage(tx as unknown as typeof db)
          seen = `${usage.level}:${usage.percent}`
          throw rollback
        })
        .catch((e) => {
          if (e !== rollback) throw e
        })
      return seen
    }
    expect(await level(0.5)).toBe("ok:50")
    expect(await level(0.8)).toBe("warn:80")
    expect(await level(1)).toBe("full:100")
  })
})
