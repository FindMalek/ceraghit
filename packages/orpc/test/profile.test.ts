import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { admins, createDb, shopProfile } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { eq } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { ConsoleMailer } from "../src/lib/mailer"
import { DemoProvider } from "../src/lib/payments"
import { getShopProfile } from "../src/lib/shop-profile"
import { adminRouter } from "../src/routers/admin"

const url = process.env.DATABASE_URL
const EMAIL = "profile-owner@test.local"

describe.skipIf(!url)("admin profile and setup", () => {
  const db = createDb(url!)
  const services: Services = {
    db,
    payments: new DemoProvider("https://web.test"),
    mailer: new ConsoleMailer(),
    storage: null,
    auth: new AdminAuth(db),
    now: () => new Date(),
    config: {
      webUrl: "https://web.test",
      apiPublicUrl: "https://api.test",
      appEnv: "local",
      deployEnv: "test",
      secureCookies: false,
      onlinePayments: false,
    },
  }
  const client = (token: string) =>
    createRouterClient(adminRouter, {
      context: (): Context =>
        createContext(services, new Headers({ cookie: `ceraghit_admin=${token}`, "x-csrf-token": "orpc" })),
    })
  let owner: ReturnType<typeof client>
  let savedProfile: typeof shopProfile.$inferSelect | undefined

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { admin: { email: EMAIL, password: "clay-test-pass" } })
    savedProfile = (await db.select().from(shopProfile))[0]
    await db.delete(shopProfile)
    const session = await services.auth.login("127.0.0.1", EMAIL, "clay-test-pass")
    owner = client(session!.token)
  })

  afterAll(async () => {
    await db.delete(admins).where(eq(admins.email, EMAIL))
    await db.delete(shopProfile)
    if (savedProfile) await db.insert(shopProfile).values(savedProfile)
  })

  test("the saved owner name survives the next seed", async () => {
    await owner.profile.updateOwner({ name: "  Nadia Ben Ali " })
    await seed(db, { admin: { email: EMAIL, password: "clay-test-pass" } })
    const { owner: me } = await owner.profile.get()
    expect(me).toMatchObject({ name: "Nadia Ben Ali", nameConfirmed: true })
    expect(await owner.auth.me()).toMatchObject({ name: "Nadia Ben Ali", nameConfirmed: true })
  })

  test("finish refuses until the required steps are done, then sets onboardedAt once", async () => {
    await expect(owner.setup.finish()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
    await owner.profile.update({
      legalName: "Ceraghit SARL",
      displayName: "Ceraghit",
      address: "1 rue du test",
      city: "Tunis",
      phones: ["+216 20 000 000"],
      email: "atelier@example.com",
      notifyEmail: "atelier@example.com",
      taxId: "1234567A",
      bankHolder: "Atelier",
      bankName: "Banque Test",
      bankIban: "TN5910006035183598478831",
    })
    await owner.setup.confirmShipping()
    await owner.setup.finish()
    const first = (await getShopProfile(db)).onboardedAt
    expect(first).not.toBeNull()
    await owner.setup.finish()
    expect((await getShopProfile(db)).onboardedAt).toEqual(first)
    expect(await owner.setup.status()).toMatchObject({ requiredDone: true, onboarded: true })
  })

  test("required steps cannot be skipped, optional ones can come back", async () => {
    // @ts-expect-error "bank" is not an optional step
    await expect(owner.setup.skip({ step: "bank" })).rejects.toThrow()
    await owner.setup.skip({ step: "groq" })
    expect((await owner.setup.status()).steps.find((s) => s.id === "groq")?.skipped).toBe(true)
    await owner.setup.unskip({ step: "groq" })
    expect((await owner.setup.status()).steps.find((s) => s.id === "groq")?.skipped).toBe(false)
  })

  test("bank codes are saved without spaces and in capitals", async () => {
    await owner.profile.update({ bankIban: "tn59 1000 6035 1835 9847 8831", bankBic: "bstu tntt" })
    const { shop } = await owner.profile.get()
    expect(shop).toMatchObject({ bankIban: "TN5910006035183598478831", bankBic: "BSTUTNTT" })
  })
})
