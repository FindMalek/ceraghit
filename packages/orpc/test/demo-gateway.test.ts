import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { categories, createDb, invoices, orders, products } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { eq, inArray } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { ConsoleMailer } from "../src/lib/mailer"
import { assertNoDemoInProduction, DemoProvider } from "../src/lib/payments"
import { appRouter } from "../src/routers"

const url = process.env.DATABASE_URL

describe.skipIf(!url)("demo gateway", () => {
  const db = createDb(url!)
  const tag = `dg${Date.now()}`
  const email = `${tag}@example.com`
  let productId = ""
  let visitors = 0

  const servicesFor = (appEnv: "local" | "production"): Services => ({
    db,
    payments: new DemoProvider("https://web.test"),
    mailer: new ConsoleMailer(),
    storage: null,
    auth: new AdminAuth(db),
    now: () => new Date(),
    config: {
      webUrl: "https://web.test",
      apiPublicUrl: "https://api.test",
      appEnv,
      deployEnv: "test",
      secureCookies: false,
      onlinePayments: true,
    },
  })
  const clientFor = (services: Services) =>
    createRouterClient(appRouter, {
      context: (): Context => createContext(services, new Headers({ "x-forwarded-for": `${tag}-${visitors++}` })),
    })

  const buy = async (client: ReturnType<typeof clientFor>) => {
    const created = await client.public.orders.create({
      currency: "TND",
      customerName: "Test Buyer",
      email,
      phone: "+21620000000",
      country: "TN",
      city: "Tunis",
      address: "1 rue du test",
      items: [{ productId, quantity: 1 }],
      locale: "fr",
    })
    const [order] = await db.select().from(orders).where(eq(orders.number, created.number))
    return { created, ref: order!.paymentRef! }
  }
  const view = (client: ReturnType<typeof clientFor>, created: { number: string; token: string }) =>
    client.public.orders.get({ number: created.number, token: created.token })
  const stock = async () => (await db.select().from(products).where(eq(products.id, productId)))[0]!.stock

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { admin: { email: "owner@test.local", password: "clay-test-pass" } })
    const [cat] = await db
      .insert(categories)
      .values({ slug: tag, name: { fr: "Test" } })
      .returning()
    const [product] = await db
      .insert(products)
      .values({
        ref: tag,
        slug: tag,
        categoryId: cat!.id,
        title: { fr: "Mug" },
        priceTnd: 40_000,
        priceEur: 1_200,
        stock: 5,
        status: "published",
      })
      .returning()
    productId = product!.id
  })

  afterAll(async () => {
    const all = await db.select({ id: orders.id }).from(orders).where(eq(orders.email, email))
    if (all.length) {
      const ids = all.map((o) => o.id)
      await db.delete(invoices).where(inArray(invoices.orderId, ids))
      await db.delete(orders).where(inArray(orders.id, ids))
    }
    await db.close()
  })

  test("a pending payment survives an api restart and then settles as paid", async () => {
    const { created, ref } = await buy(clientFor(servicesFor("local")))
    const restarted = clientFor(servicesFor("local"))
    expect((await view(restarted, created)).status).toBe("pending_payment")
    await restarted.public.orders.demoResolve({ ref, outcome: "paid" })
    expect((await view(restarted, created)).status).toBe("paid")
    await expect(restarted.public.orders.demoResolve({ ref, outcome: "failed" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
  })

  test("a failed payment cancels the order and puts the stock back", async () => {
    const client = clientFor(servicesFor("local"))
    const before = await stock()
    const { created, ref } = await buy(client)
    expect(await stock()).toBe(before - 1)
    await client.public.orders.demoResolve({ ref, outcome: "failed" })
    expect((await view(client, created)).status).toBe("cancelled")
    expect(await stock()).toBe(before)
  })

  test("a payment with the wrong amount leaves the order pending", async () => {
    const client = clientFor(servicesFor("local"))
    const { created, ref } = await buy(client)
    await client.public.orders.demoResolve({ ref, outcome: "mismatch" })
    expect((await view(client, created)).status).toBe("pending_payment")
  })

  test("a ref the gateway never issued counts as failed", async () => {
    const demo = new DemoProvider("https://web.test")
    for (const ref of ["demo_seed_3", "demo:paid:CER-1", "demo:paid:CER-1:100:TND", "demo:paid:CER-1:x:TND:abc"]) {
      expect((await demo.check(ref)).status).toBe("failed")
    }
  })

  test("a hand-made ref for someone else's order is refused", async () => {
    const client = clientFor(servicesFor("local"))
    const { created, ref } = await buy(client)
    const [, , number, amount, currency] = ref.split(":")
    for (const forged of [
      `demo:pending:${number}:${amount}:${currency}`,
      `demo:pending:${number}:${amount}:${currency}:${"0".repeat(32)}`,
    ]) {
      await expect(client.public.orders.demoResolve({ ref: forged, outcome: "paid" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      })
    }
    expect((await view(client, created)).status).toBe("pending_payment")
  })

  test("the api refuses to boot with card payments on the demo gateway in production", () => {
    const demo = new DemoProvider("https://web.test")
    expect(() => assertNoDemoInProduction({ appEnv: "production", onlinePayments: true }, demo)).toThrow()
    expect(() => assertNoDemoInProduction({ appEnv: "production", onlinePayments: false }, demo)).not.toThrow()
    expect(() => assertNoDemoInProduction({ appEnv: "preview", onlinePayments: true }, demo)).not.toThrow()
  })

  test("production never resolves demo payments", async () => {
    const { ref } = await buy(clientFor(servicesFor("local")))
    await expect(
      clientFor(servicesFor("production")).public.orders.demoResolve({ ref, outcome: "paid" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
})
