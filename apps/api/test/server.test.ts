import { expect, test } from "bun:test"
import type { Services } from "@workspace/orpc"
import { withRequestLogging } from "../src/logger"
import { createServer } from "../src/server"

function serverFor(appEnv: "local" | "preview" | "production") {
  const services = {
    db: { execute: () => Promise.reject(new Error("down")) },
    payments: { name: "demo", mode: "test" },
    storage: null,
    config: {
      webUrl: "http://localhost:3000",
      apiPublicUrl: "http://localhost:3001",
      appEnv,
      deployEnv: appEnv === "production" ? "production" : "local",
      secureCookies: appEnv !== "local",
      onlinePayments: false,
    },
  } as unknown as Services
  return createServer(services)
}

const get = (path: string) => new Request(`http://api.test${path}`)

test("responses are hardened and /health is never cached", async () => {
  const res = await serverFor("preview")(get("/health"))
  expect(res.headers.get("x-content-type-options")).toBe("nosniff")
  expect(res.headers.get("referrer-policy")).toBe("no-referrer")
  expect(res.headers.get("cache-control")).toBe("no-store")
  expect(res.headers.get("strict-transport-security")).toBeNull()
})

test("production sends HSTS and hides the api docs and spec", async () => {
  const fetch = serverFor("production")
  for (const path of ["/v1/docs", "/v1/docs/", "/v1/openapi.json", "/v1/openapi.json/", "/docs", "/"]) {
    const res = await fetch(get(path))
    expect(res.status).toBe(404)
    expect(res.headers.get("strict-transport-security")).toContain("max-age=63072000")
  }
})

test("previews keep the docs and the spec", async () => {
  const fetch = serverFor("preview")
  expect((await fetch(get("/docs"))).status).toBe(302)
  const spec = await fetch(get("/v1/openapi.json"))
  expect(spec.status).toBe(200)
  expect(spec.headers.get("cache-control")).toBe("no-store")
})

const services = {
  config: { webUrl: "https://web.test", apiPublicUrl: "https://api.test", appEnv: "local", deployEnv: "test" },
} as Services
const fetch = createServer(services)

for (const path of ["/nope", "/v1/nope", "/rpc/nope", "/cron/cleanup-uploads"]) {
  test(`unknown path ${path} answers a JSON 404`, async () => {
    const response = await fetch(new Request(`https://api.test${path}`))
    expect(response.status).toBe(404)
    expect(response.headers.get("content-type")).toContain("application/json")
    expect(await response.json()).toEqual({ message: "Not found." })
  })
}

const traced = withRequestLogging(fetch)

test("every response carries an x-request-id, and a plain inbound one is echoed", async () => {
  const fresh = await traced(get("/nope"))
  expect(fresh.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/)

  const echoed = await traced(new Request("https://api.test/nope", { headers: { "x-request-id": "req-1234567890" } }))
  expect(echoed.headers.get("x-request-id")).toBe("req-1234567890")
})

test.skipIf(!process.env.DATABASE_URL)("/health shows only the saved provider and environment", async () => {
  const { createDb, settings } = await import("@workspace/db")
  const { runMigrations } = await import("@workspace/db/migrate")
  const { eq } = await import("drizzle-orm")
  const db = createDb(process.env.DATABASE_URL!)
  await runMigrations(db)
  await db.delete(settings).where(eq(settings.key, "shipping"))
  await db.insert(settings).values({ key: "shipping", value: { provider: "aramex", quoteFromProvider: false } })
  const services = {
    db,
    payments: { name: "demo", mode: "test" },
    storage: null,
    secrets: null,
    config: {
      webUrl: "http://localhost:3000",
      apiPublicUrl: "http://localhost:3001",
      appEnv: "preview",
      deployEnv: "local",
      secureCookies: true,
      onlinePayments: false,
    },
  } as unknown as Services
  const body = (await (await createServer(services)(get("/health"))).json()) as { shipping: string }
  await db.delete(settings).where(eq(settings.key, "shipping"))
  expect(body.shipping).toBe("aramex:preview")
})

test("/files redirects a public key but never a private one such as a carrier label", async () => {
  const services = {
    db: {},
    payments: { name: "demo", mode: "test" },
    storage: {
      bucket: "b",
      prefix: "pr-1/",
      readUrl: async (key: string) => `https://cdn.test/${key}`,
    },
    config: {
      webUrl: "http://localhost:3000",
      apiPublicUrl: "http://localhost:3001",
      appEnv: "preview",
      deployEnv: "local",
      secureCookies: true,
      onlinePayments: false,
    },
  } as unknown as Services
  const fetch = createServer(services)
  const open = await fetch(get("/files/pr-1/media/vase.webp"))
  expect(open.status).toBe(302)
  expect(open.headers.get("location")).toBe("https://cdn.test/pr-1/media/vase.webp")
  for (const path of [
    "/files/pr-1/private/labels/a.pdf",
    "/files/pr-1/private/x",
    `/files/${encodeURIComponent("pr-1/private/labels/a.pdf")}`,
  ]) {
    expect((await fetch(get(path))).status, path).toBe(404)
  }
})
