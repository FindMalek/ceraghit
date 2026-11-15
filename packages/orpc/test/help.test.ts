import { afterAll, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { createDb, settings } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { EMPTY_TUTORIAL_LINKS } from "@workspace/sdk"
import { eq } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { ConsoleMailer } from "../src/lib/mailer"
import { DemoProvider } from "../src/lib/payments"
import { adminRouter } from "../src/routers/admin"

const url = process.env.DATABASE_URL
const db = url ? createDb(url) : null

afterAll(async () => {
  await db?.close()
})

test.skipIf(!url)("tutorial links start empty and the owner's saved links come back", async () => {
  const services: Services = {
    db: db!,
    payments: new DemoProvider("https://web.test"),
    mailer: new ConsoleMailer(),
    storage: null,
    auth: new AdminAuth(db!),
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
  await runMigrations(db!)
  await seed(db!, { admin: { email: "owner@test.local", password: "clay-test-pass" } })
  const [before] = await db!.select().from(settings).where(eq(settings.key, "tutorials"))
  await db!.delete(settings).where(eq(settings.key, "tutorials"))
  const session = await services.auth.login("127.0.0.1", "owner@test.local", "clay-test-pass")
  const owner = createRouterClient(adminRouter, {
    context: (): Context =>
      createContext(services, new Headers({ cookie: `ceraghit_admin=${session!.token}`, "x-csrf-token": "orpc" })),
  })

  expect(await owner.help.get()).toEqual(EMPTY_TUTORIAL_LINKS)
  const links = { ...EMPTY_TUTORIAL_LINKS, "02": { desktop: "dQw4w9WgXcQ", mobile: null } }
  await owner.help.update(links)
  expect(await owner.help.get()).toEqual(links)
  await expect(owner.help.update({ ...links, "02": { desktop: "https://youtu.be/x", mobile: null } })).rejects.toThrow()

  await db!.delete(settings).where(eq(settings.key, "tutorials"))
  if (before) await db!.insert(settings).values(before)
})
