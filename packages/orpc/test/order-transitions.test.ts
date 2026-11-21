import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { categories, createDb, invoices, orderAudit, orderItems, orders, products } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import type { PaymentMethod } from "@workspace/sdk"
import { eq, inArray, like } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { releaseExpiredHolds } from "../src/lib/orders"
import { DemoProvider } from "../src/lib/payments"
import { appRouter } from "../src/routers"
import { visitorHeaders } from "./fixtures/visitor"

const url = process.env.DATABASE_URL

type Status = "pending_payment" | "paid" | "fulfilled" | "cancelled" | "refunded"
type Action = "set:paid" | "set:fulfilled" | "set:cancelled" | "set:refunded" | "markPaid" | "release"
type Outcome = { status: Status; restock: boolean; audit: boolean } | "refused"

const METHODS: PaymentMethod[] = ["online", "cod", "transfer", "payoneer"]
const STATUSES: Status[] = ["pending_payment", "paid", "fulfilled", "cancelled", "refunded"]
const ACTIONS: Action[] = ["set:paid", "set:fulfilled", "set:cancelled", "set:refunded", "markPaid", "release"]
const unchanged = (status: Status): Outcome => ({ status, restock: false, audit: false })
const moved = (status: Status, restock = false): Outcome => ({ status, restock, audit: true })

/**
 * The rules, one row per action. A card order is paid by its gateway only; cash on delivery ships straight from
 * pending; transfer and Payoneer are paid by the owner (`markPaidManually`); cancelled and refunded are terminal;
 * pieces return to stock unless the order had already shipped; only unpaid orders expire (never cash on delivery,
 * which has no hold by default). A card order expires silently, the others leave an audit row.
 */
function expected(method: PaymentMethod, from: Status, action: Action): Outcome {
  const pending = from === "pending_payment"
  const offline = method !== "online"
  switch (action) {
    case "set:paid":
      return pending && offline ? moved("paid") : "refused"
    case "markPaid":
      if (!offline) return "refused"
      if (pending) return moved("paid")
      return from === "paid" || from === "fulfilled" ? unchanged(from) : "refused"
    case "set:fulfilled":
      return from === "paid" || (pending && method === "cod") ? moved("fulfilled") : "refused"
    case "set:cancelled":
      return pending || from === "paid" ? moved("cancelled", true) : "refused"
    case "set:refunded":
      if (from === "paid") return moved("refunded", true)
      return from === "fulfilled" ? moved("refunded") : "refused"
    case "release":
      if (!pending || method === "cod") return unchanged(from)
      return { status: "cancelled", restock: true, audit: offline }
  }
}

describe.skipIf(!url)("order status transitions", () => {
  const db = createDb(url!)
  const services: Services = {
    db,
    payments: new DemoProvider("https://web.test"),
    mailer: { send: async () => ({ id: null }) },
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
  const tag = `tr${Date.now()}`
  const number = (n: number) => `TST-TR-${tag}-${n}`
  const clientFor = (headers: Headers) =>
    createRouterClient(appRouter, { context: (): Context => createContext(services, headers) })
  let owner: ReturnType<typeof clientFor>
  let categoryId = ""
  let productId = ""
  let seq = 0

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { admin: { email: "owner@test.local", password: "clay-test-pass" } })
    const session = await services.auth.login("127.0.0.1", "owner@test.local", "clay-test-pass")
    const headers = visitorHeaders({ cookie: `ceraghit_admin=${session!.token}`, "x-csrf-token": "orpc" })
    owner = clientFor(headers)
    const [cat] = await db
      .insert(categories)
      .values({ slug: tag, name: { fr: "Test" } })
      .returning()
    categoryId = cat!.id
    const [p] = await db
      .insert(products)
      .values({
        ref: tag,
        slug: tag,
        categoryId,
        title: { fr: "Tasse" },
        priceTnd: 40_000,
        priceEur: 1_200,
        stock: 1_000,
        status: "published",
      })
      .returning()
    productId = p!.id
  })

  afterAll(async () => {
    const mine = db
      .select({ id: orders.id })
      .from(orders)
      .where(like(orders.number, `TST-TR-${tag}-%`))
    await db.delete(invoices).where(inArray(invoices.orderId, mine))
    await db.delete(orders).where(like(orders.number, `TST-TR-${tag}-%`))
    await db.delete(products).where(eq(products.categoryId, categoryId))
    await db.delete(categories).where(eq(categories.id, categoryId))
    await db.close()
  })

  const stock = async () => (await db.query.products.findFirst({ where: eq(products.id, productId) }))!.stock

  async function run(method: PaymentMethod, from: Status, action: Action) {
    const currency = method === "cod" || method === "online" ? "TND" : "EUR"
    const [order] = await db
      .insert(orders)
      .values({
        number: number(seq++),
        publicToken: "t",
        status: from,
        paymentMethod: method,
        currency,
        subtotalMinor: 1_000,
        totalMinor: 1_000,
        paidAt: from === "pending_payment" || from === "cancelled" ? null : new Date(),
        customerName: "Test",
        email: `${tag}@example.test`,
        phone: "20000000",
        country: currency === "TND" ? "TN" : "BE",
        city: "Tunis",
        address: "1 rue Test",
      })
      .returning()
    await db
      .insert(orderItems)
      .values({ orderId: order!.id, productId, ref: tag, title: "Tasse", unitMinor: 1_000, quantity: 1 })
    const id = order!.id
    const before = await stock()
    const status = action.startsWith("set:") ? (action.slice(4) as Exclude<Status, "pending_payment">) : null
    try {
      if (status) await owner.admin.orders.setStatus({ id, status })
      else if (action === "markPaid") {
        await owner.admin.orders.markPaidManually({
          id,
          method: method === "payoneer" || method === "transfer" ? method : "other",
          reference: null,
          note: null,
          totalMinor: 1_000,
          currency,
        })
      } else await releaseExpiredHolds(services, new Date(Date.now() + 90 * 864e5), { only: [id] })
    } catch (error) {
      if ((error as { code?: string }).code !== "BAD_REQUEST") throw error
      return "refused" as const
    }
    const after = await db.query.orders.findFirst({ where: eq(orders.id, id) })
    const audit = await db.select().from(orderAudit).where(eq(orderAudit.orderId, id))
    return { status: after!.status, restock: (await stock()) > before, audit: audit.length > 0 }
  }

  for (const method of METHODS) {
    test(`${method}: every action from every status follows the rules`, async () => {
      const got: Record<string, unknown> = {}
      const want: Record<string, unknown> = {}
      for (const from of STATUSES) {
        for (const action of ACTIONS) {
          got[`${from} + ${action}`] = await run(method, from, action)
          want[`${from} + ${action}`] = expected(method, from, action)
        }
      }
      expect(got).toEqual(want)
    })
  }
})
