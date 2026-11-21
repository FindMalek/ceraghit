import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { aiUsage, createDb } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { eq, inArray } from "drizzle-orm"
import { rolloverAiUsage } from "../src/lib/translate/translate"

const url = process.env.DATABASE_URL

describe.skipIf(!url)("ai-usage-rollover", () => {
  const db = createDb(url!)
  const months = ["2095-12", "2096-01"]

  beforeAll(async () => {
    await runMigrations(db)
    await db.delete(aiUsage).where(inArray(aiUsage.month, months))
    await db.insert(aiUsage).values({ month: "2095-12", requests: 4, tokensIn: 100, tokensOut: 50, costMicroUsd: 900 })
  })
  afterAll(async () => {
    await db.delete(aiUsage).where(inArray(aiUsage.month, months))
  })

  test("opens the new month at zero, reports the one that closed, and never resets a month already in use", async () => {
    // 00:05 on the 1st in Tunis is still the last evening of the old month in UTC
    const first = await rolloverAiUsage({ db }, new Date("2095-12-31T23:05:00Z"))
    expect(first).toEqual({ month: "2096-01", opened: 1, closedRequests: 4 })
    const [opened] = await db.select().from(aiUsage).where(eq(aiUsage.month, "2096-01"))
    expect(opened).toMatchObject({ requests: 0, costMicroUsd: 0 })

    await db.update(aiUsage).set({ requests: 2 }).where(eq(aiUsage.month, "2096-01"))
    const again = await rolloverAiUsage({ db }, new Date("2096-01-01T05:00:00Z"))
    expect(again).toMatchObject({ month: "2096-01", opened: 0 })
    const [kept] = await db.select().from(aiUsage).where(eq(aiUsage.month, "2096-01"))
    expect(kept?.requests).toBe(2)
  })
})
