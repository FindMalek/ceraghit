import { expect, test } from "bun:test"
import type { Services } from "@workspace/orpc"
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
  for (const path of ["/v1/docs", "/v1/openapi.json", "/docs", "/"]) {
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
