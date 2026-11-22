import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { admins, createDb } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { hashPassword, verifyPassword } from "@workspace/db/password"
import { seed } from "@workspace/db/seed"
import { eq } from "drizzle-orm"

const url = process.env.DATABASE_URL

describe.skipIf(!url)("owner login bootstrap", () => {
  const db = createDb(url!)
  const email = `boot-${Date.now()}@test.local`
  const stored = async () => (await db.select().from(admins).where(eq(admins.email, email)))[0]!.passwordHash

  beforeAll(() => runMigrations(db))
  afterAll(async () => {
    await db.delete(admins).where(eq(admins.email, email))
    await db.close()
  })

  test("a re-bootstrap keeps the password the owner chose, unless rotating is asked for", async () => {
    await seed(db, { admin: { email, password: "first-secret-value" } })
    expect(await verifyPassword("first-secret-value", await stored())).toBe(true)

    await db
      .update(admins)
      .set({ passwordHash: await hashPassword("owner-chosen-password") })
      .where(eq(admins.email, email))
    await seed(db, { admin: { email, password: "first-secret-value" } })
    expect(await verifyPassword("owner-chosen-password", await stored())).toBe(true)

    await seed(db, { admin: { email, password: "rotated-secret-value", rotatePassword: true } })
    expect(await verifyPassword("rotated-secret-value", await stored())).toBe(true)
  })
})
