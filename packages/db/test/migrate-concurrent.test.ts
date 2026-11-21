import { afterAll, describe, expect, test } from "bun:test"
import { createDb } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { sql } from "drizzle-orm"
import postgres from "postgres"

const url = process.env.DATABASE_URL

describe.skipIf(!url)("concurrent migrations", () => {
  const scratch = `migrate_race_${process.pid}`
  const admin = postgres(url!, { max: 1, onnotice: () => {} })
  const target = new URL(url!)
  target.pathname = `/${scratch}`
  const dbs = [createDb(target.toString(), 3), createDb(target.toString(), 3)]

  afterAll(async () => {
    await Promise.all(dbs.map((d) => d.close()))
    await admin.unsafe(`drop database if exists ${scratch}`)
    await admin.end()
  })

  test("two migrators on one empty database both succeed", async () => {
    await admin.unsafe(`create database ${scratch}`)
    const results = await Promise.allSettled(dbs.map((d) => runMigrations(d)))
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"])
    const [row] = await dbs[0]!.execute(sql`select to_regtype('public.currency') as t`)
    expect(row?.["t"]).toBe("currency")
  })

  test("a pool of one connection migrates and seeds without deadlock", async () => {
    const single = createDb(target.toString(), 1)
    try {
      await runMigrations(single)
      await seed(single, { catalog: true })
    } finally {
      await single.close()
    }
  }, 20_000)

  test("two seeds at once on the same database both succeed", async () => {
    const results = await Promise.allSettled(dbs.map((d) => seed(d, { catalog: true })))
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"])
  }, 20_000)
})
