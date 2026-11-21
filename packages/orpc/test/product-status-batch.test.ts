import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { createDb, products } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { eq, inArray } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { ConsoleMailer } from "../src/lib/mailer"
import { DemoProvider } from "../src/lib/payments"
import { adminRouter } from "../src/routers/admin"

const url = process.env.DATABASE_URL
const makeOwner = (context: () => Context) => createRouterClient(adminRouter, { context })

describe.skipIf(!url)("bulk product status", () => {
  const db = createDb(url!)
  const run = crypto.randomUUID().slice(0, 8)
  const ids: string[] = []
  let owner: ReturnType<typeof makeOwner>

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { catalog: true, admin: { email: "owner@test.local", password: "clay-test-pass" } })
    const services: Services = {
      db,
      payments: new DemoProvider("https://web.test"),
      mailer: new ConsoleMailer(),
      storage: {
        bucket: "b",
        prefix: `pr-${run}/`,
        presignPut: async (key) => key,
        put: async () => {},
        signedGet: async (key) => key,
        head: async () => true,
        read: async () => null,
        readUrl: async (key) => key,
        publicUrl: () => null,
        remove: async () => {},
        list: async () => [],
      },
      auth: new AdminAuth(db),
      now: () => new Date(),
      config: {
        webUrl: "https://web.test",
        apiPublicUrl: "https://api.test",
        appEnv: "local",
        deployEnv: "test",
        secureCookies: false,
        onlinePayments: true,
      },
    }
    const session = await services.auth.login("127.0.0.1", "owner@test.local", "clay-test-pass")
    const headers = () =>
      new Headers({
        cookie: `ceraghit_admin=${session!.token}`,
        "x-csrf-token": "orpc",
        "x-forwarded-for": `bulk-${run}`,
      })
    owner = makeOwner(() => createContext(services, headers()))
    const [category] = await db.query.categories.findMany({ limit: 1 })
    const rows = await db
      .insert(products)
      .values(
        (["draft", "draft", "archived"] as const).map((status, i) => ({
          ref: `B${run}${i}`,
          slug: `bulk-${run}-${i}`,
          categoryId: category!.id,
          title: { fr: "Pièce" },
          priceTnd: 1000,
          priceEur: 300,
          status,
        })),
      )
      .returning({ id: products.id })
    ids.push(...rows.map((r) => r.id))
  })

  afterAll(async () => {
    await db.delete(products).where(inArray(products.id, ids))
    await db.close()
  })

  const statusOf = async (id: string) => (await db.query.products.findFirst({ where: eq(products.id, id) }))!.status

  test("publishes the selection and leaves archived products archived", async () => {
    const result = await owner.products.setStatus({ ids, status: "published" })
    expect(result.updated).toBe(2)
    expect(await Promise.all(ids.map(statusOf))).toEqual(["published", "published", "archived"])
  })

  test("unpublishes back to draft", async () => {
    await owner.products.setStatus({ ids: ids.slice(0, 2), status: "draft" })
    expect(await Promise.all(ids.slice(0, 2).map(statusOf))).toEqual(["draft", "draft"])
  })
})
