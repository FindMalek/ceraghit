import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { createDb, settings, shopProfile } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { DEFAULT_SHIPPING_RATES } from "@workspace/sdk"
import { eq } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { ConsoleMailer } from "../src/lib/mailer"
import { DemoProvider } from "../src/lib/payments"
import { ensureShopProfile, getShopProfile, studioInbox, updateShopProfile } from "../src/lib/shop-profile"
import { appRouter } from "../src/routers"
import { adminRouter } from "../src/routers/admin"

const url = process.env.DATABASE_URL

describe.skipIf(!url)("shop profile", () => {
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
  const legacy = {
    contactEmail: "atelier@example.com",
    phones: ["+216 20 000 000"],
    whatsapp: null,
    instagram: null,
    shippingRates: DEFAULT_SHIPPING_RATES,
    shippingNote: null,
    bank: { holder: "Atelier Test", bank: "Banque Test", iban: "TN5910006035183598478831", bic: "BSTUTNTT" },
  }
  let original: unknown

  const setLegacy = (value: unknown) =>
    db.insert(settings).values({ key: "studio", value }).onConflictDoUpdate({ target: settings.key, set: { value } })

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { admin: { email: "owner@test.local", password: "clay-test-pass" } })
    original = (await db.select().from(settings).where(eq(settings.key, "studio")))[0]?.value
  })

  beforeEach(async () => {
    await db.delete(shopProfile)
  })

  afterAll(async () => {
    await db.delete(shopProfile)
    if (original) await setLegacy(original)
    else await db.delete(settings).where(eq(settings.key, "studio"))
  })

  test("backfill copies contact, phones and a real bank account from the studio settings", async () => {
    await setLegacy(legacy)
    const profile = await getShopProfile(db)
    expect(profile).toMatchObject({
      email: "atelier@example.com",
      notifyEmail: "atelier@example.com",
      phones: ["+216 20 000 000"],
      bankHolder: "Atelier Test",
      bankName: "Banque Test",
      bankIban: "TN5910006035183598478831",
      bankBic: "BSTUTNTT",
    })
  })

  test("backfill leaves the bank empty when it was still the placeholder", async () => {
    await setLegacy({
      ...legacy,
      bank: { holder: "Ceraghit Creation", bank: "À compléter", iban: "À compléter", bic: "" },
    })
    const profile = await getShopProfile(db)
    expect(profile).toMatchObject({ bankName: null, bankIban: null, bankBic: null, email: "atelier@example.com" })
  })

  test("running the backfill again never overwrites the owner's edits", async () => {
    await setLegacy(legacy)
    await updateShopProfile(db, { email: "nouveau@example.com" })
    await ensureShopProfile(db)
    expect((await getShopProfile(db)).email).toBe("nouveau@example.com")
  })

  test("public settings expose only the public subset", async () => {
    await setLegacy(legacy)
    await updateShopProfile(db, { taxId: "1234567A", registryNumber: "B0123", notifyEmail: "prive@example.com" })
    const guest = createRouterClient(appRouter, { context: (): Context => createContext(services, new Headers()) })
    const result = await guest.public.catalog.settings()
    const json = JSON.stringify(result)
    for (const hidden of ["registryNumber", "notifyEmail", "prive@example.com", "bank", "Banque Test"])
      expect(json).not.toContain(hidden)
    expect(result.contactEmail).toBe("atelier@example.com")
    expect(result.profile.taxId).toBe("1234567A")
  })

  test("saving settings after the backfill keeps the profile intact", async () => {
    await setLegacy(legacy)
    const session = await services.auth.login("127.0.0.1", "owner@test.local", "clay-test-pass")
    const owner = createRouterClient(adminRouter, {
      context: (): Context =>
        createContext(services, new Headers({ cookie: `ceraghit_admin=${session!.token}`, "x-csrf-token": "orpc" })),
    })
    const { contactEmail: _e, phones: _p, bank: _b, ...rest } = legacy
    await owner.settings.update({ ...rest, instagram: "@atelier" })
    const profile = await getShopProfile(db)
    expect(profile).toMatchObject({ email: "atelier@example.com", bankIban: "TN5910006035183598478831" })
    const [row] = await db.select().from(settings).where(eq(settings.key, "studio"))
    expect(row?.value).toMatchObject({ instagram: "@atelier", contactEmail: "atelier@example.com" })
  })

  test("a contact saved from the dashboard settings reaches the storefront", async () => {
    await setLegacy(legacy)
    const session = await services.auth.login("127.0.0.1", "owner@test.local", "clay-test-pass")
    const owner = createRouterClient(adminRouter, {
      context: (): Context =>
        createContext(services, new Headers({ cookie: `ceraghit_admin=${session!.token}`, "x-csrf-token": "orpc" })),
    })
    await owner.settings.update({ ...legacy, contactEmail: "nouveau@example.com", phones: ["+216 21 111 111"] })
    const guest = createRouterClient(appRouter, { context: (): Context => createContext(services, new Headers()) })
    const result = await guest.public.catalog.settings()
    expect(result).toMatchObject({ contactEmail: "nouveau@example.com", phones: ["+216 21 111 111"] })
    expect(studioInbox(await getShopProfile(db))).toBe("nouveau@example.com")
  })
})
