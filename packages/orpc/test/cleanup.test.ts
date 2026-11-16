import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { categories, createDb, media, uploads } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { eq, like } from "drizzle-orm"
import { cleanupUploads, STORAGE_REFERENCES } from "../src/lib/cleanup"
import type { Storage } from "../src/lib/storage"

const url = process.env.DATABASE_URL
const DAY = 86_400_000
const HOUR = 3_600_000

describe.skipIf(!url)("media cleanup", () => {
  const root = createDb(url!)
  let db = root
  const rollback = new Error("rollback")
  /** Sweeps walk every row, so each test runs in a transaction that is always rolled back: other data is never touched. */
  const inTx = (fn: () => Promise<void>) => async () => {
    removed = []
    await root
      .transaction(async (tx) => {
        db = tx as unknown as typeof root
        await fn()
        throw rollback
      })
      .catch((e) => {
        if (e !== rollback) throw e
      })
    db = root
  }
  const run = crypto.randomUUID().slice(0, 8)
  const t0 = new Date("2031-03-01T03:00:00Z")
  const at = (ms: number) => new Date(t0.getTime() + ms)
  const key = (name: string) => `pr-${run}/media/${name}.webp`
  let removed: string[] = []
  let failOn: string | null = null
  const storage = {
    remove: async (k: string) => {
      if (k === failOn) throw new Error("boom")
      removed.push(k)
    },
  } as unknown as Storage
  const mine = () => removed.filter((k) => k.includes(run))
  const sweep = (now: Date, extra: { dryRun?: boolean; batchSize?: number } = {}) =>
    cleanupUploads(db, storage, { now, ...extra })

  async function add(name: string, o: { created?: Date; confirmed?: boolean; keep?: boolean; folder?: string } = {}) {
    const k = o.folder ? `pr-${run}/${o.folder}/${name}.webp` : key(name)
    await db.insert(uploads).values({
      key: k,
      folder: o.folder ?? "media",
      contentType: "image/webp",
      bytes: 100,
      createdAt: o.created ?? t0,
    })
    const [row] = await db
      .insert(media)
      .values({
        key: k,
        filename: `${name}.webp`,
        keep: o.keep ?? false,
        confirmedAt: o.confirmed === false ? null : t0,
        createdAt: o.created ?? t0,
      })
      .returning()
    return row!
  }

  beforeAll(async () => {
    await runMigrations(root)
  })
  afterAll(async () => {
    await root.close()
  })

  test(
    "an upload never confirmed goes after 48 hours, not before",
    inTx(async () => {
      await add("abandoned", { confirmed: false })
      await sweep(at(47 * HOUR))
      expect(mine()).toEqual([])
      const report = await sweep(at(49 * HOUR))
      expect(mine()).toEqual([key("abandoned")])
      expect(report.abandonedDeleted).toBeGreaterThanOrEqual(1)
      expect(
        await db
          .select()
          .from(media)
          .where(eq(media.key, key("abandoned"))),
      ).toEqual([])
      expect(
        await db
          .select()
          .from(uploads)
          .where(eq(uploads.key, key("abandoned"))),
      ).toEqual([])
    }),
  )

  test(
    "unused library media is marked, kept until day 30 and deleted after; used again it is restored",
    inTx(async () => {
      await add("lib")
      const back = await add("back")
      await sweep(at(0))
      const marked = await db
        .select()
        .from(media)
        .where(eq(media.key, key("lib")))
      expect(marked[0]?.unusedSince).toEqual(at(0))
      await db.insert(categories).values({ slug: `c-${run}`, name: { fr: "T" }, imageMediaId: back.id })
      await sweep(at(10 * DAY))
      expect((await db.select().from(media).where(eq(media.id, back.id)))[0]?.unusedSince).toBeNull()
      const near = await sweep(at(25 * DAY))
      expect(near.warned).toBeGreaterThanOrEqual(1)
      await sweep(at(29 * DAY))
      expect(mine()).toEqual([])
      await sweep(at(31 * DAY))
      expect(mine()).toEqual([key("lib")])
      expect(await db.select().from(media).where(eq(media.id, back.id))).toHaveLength(1)
      await sweep(at(31 * DAY))
      expect(mine()).toEqual([key("lib")])
    }),
  )

  test(
    "pinned, referenced, registered and non-image files survive, however old",
    inTx(async () => {
      await add("pinned", { keep: true })
      await add("labelled", { folder: "labels" })
      await add("registered")
      await add("legacy")
      await db.insert(categories).values({ slug: `l-${run}`, name: { fr: "T" }, image: `s3:${key("legacy")}` })
      STORAGE_REFERENCES.push(async () => [key("registered")])
      try {
        await sweep(at(0))
        await sweep(at(90 * DAY))
      } finally {
        STORAGE_REFERENCES.pop()
      }
      expect(mine()).toEqual([])
    }),
  )

  test(
    "a dry run reports the file and changes nothing",
    inTx(async () => {
      await add("dry")
      await sweep(at(0))
      const report = await sweep(at(31 * DAY), { dryRun: true })
      expect(report.items.map((i) => i.key)).toContain(key("dry"))
      expect(mine()).toEqual([])
      expect(
        await db
          .select()
          .from(media)
          .where(eq(media.key, key("dry"))),
      ).toHaveLength(1)
    }),
  )

  test(
    "a failed bucket removal is counted and the cap limits deletions",
    inTx(async () => {
      failOn = key("dry")
      const report = await sweep(at(31 * DAY), { batchSize: 1 })
      expect(report.abandonedDeleted + report.unusedDeleted).toBeLessThanOrEqual(1)
      failOn = null
      expect(report.errors + mine().length).toBeLessThanOrEqual(1)
    }),
  )
})
