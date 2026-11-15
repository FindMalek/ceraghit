import { afterEach, describe, expect, test } from "bun:test"
import { admins, createDb, locations, orders, products, shopProfile } from "@workspace/db"
import { CATALOGUE } from "@workspace/db/catalogue"
import { runMigrations } from "@workspace/db/migrate"
import { type SeedOptions, seed } from "@workspace/db/seed"
import { sql } from "drizzle-orm"
import { computeSetup } from "../src/lib/setup"
import { getShopProfile, updateShopProfile } from "../src/lib/shop-profile"

const url = process.env.DATABASE_URL
const admin = { email: "owner@test.local", password: "clay-test-pass" }
const noIntegrations = { konnect: false, aramex: false, payoneer: false, groq: false, emailDomain: false }

describe.skipIf(!url)("demo seed states", () => {
  const cleanups: (() => Promise<void>)[] = []
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup()
  })

  /** Each test seeds its own empty database: `seed` never writes into a catalogue that already exists. */
  async function freshDb(opts: SeedOptions) {
    const name = `ceraghit_seed_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`
    const root = createDb(url!, 1)
    await root.execute(sql.raw(`create database ${name}`))
    const db = createDb(url!.replace(/\/[^/?]+$/, `/${name}`), 2)
    cleanups.push(async () => {
      await db.close()
      await root.execute(sql.raw(`drop database ${name} with (force)`))
      await root.close()
    })
    await runMigrations(db)
    await seed(db, { admin, ...opts })
    return db
  }

  const setupOf = async (db: Awaited<ReturnType<typeof freshDb>>) => {
    const [owner] = await db.select({ name: admins.name, nameConfirmedAt: admins.nameConfirmedAt }).from(admins)
    return computeSetup({ owner: owner!, profile: await getShopProfile(db), integrations: noIntegrations })
  }

  test("the complete demo shop has nothing left to set up", async () => {
    const db = await freshDb({ demo: true })
    const status = await setupOf(db)
    expect(status.requiredDone).toBe(true)
    expect(status.onboarded).toBe(true)
  })

  test("the onboarding demo starts with an empty profile and an unconfirmed owner", async () => {
    const db = await freshDb({ demo: true, profile: "empty" })
    const status = await setupOf(db)
    expect(status.onboarded).toBe(false)
    expect(status.requiredDone).toBe(false)
    expect((await db.select().from(locations)).length).toBe(2)
  })

  test("seeding again keeps the profile the owner edited", async () => {
    const db = await freshDb({ demo: true })
    await updateShopProfile(db, { legalName: "Atelier Sabri" })
    await seed(db, { admin, demo: true })
    expect((await getShopProfile(db)).legalName).toBe("Atelier Sabri")
  })

  test("the demo seed is refused in production", async () => {
    const previous = process.env.APP_ENV
    process.env.APP_ENV = "production"
    try {
      await expect(seed(createDb(url!, 1), { demo: true })).rejects.toThrow("APP_ENV=production")
    } finally {
      if (previous === undefined) delete process.env.APP_ENV
      else process.env.APP_ENV = previous
    }
  })

  test("the catalogue seed for production keeps the catalogue descriptions and adds no demo content", async () => {
    const db = await freshDb({ catalog: true })
    const rows = await db.select({ ref: products.ref, description: products.description }).from(products)
    const expected = new Map(CATALOGUE.map((p) => [p.ref, p.description ?? null]))
    expect(rows.length).toBe(CATALOGUE.length)
    for (const row of rows) expect(row.description?.fr ?? null).toBe(expected.get(row.ref)!)
    expect(await db.select().from(locations)).toEqual([])
    expect(await db.select().from(orders)).toEqual([])
    expect(await db.select().from(shopProfile)).toEqual([])
  })
})
