import { afterEach, expect, test } from "bun:test"
import { proxyToApi, WEB_ALLOWED } from "../src/proxy"

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
  delete process.env.PROXY_SECRET
})

async function forwardedHeaders(headers: Record<string, string>): Promise<Headers> {
  let seen = new Headers()
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    seen = new Headers(init?.headers)
    return Response.json({})
  }) as typeof fetch
  await proxyToApi(new Request("https://shop.test/api/rpc/public/orders", { headers }), WEB_ALLOWED)
  return seen
}

test("the proxy drops client x-ceraghit-* headers and sets the real client address", async () => {
  process.env.PROXY_SECRET = "p".repeat(32)
  const seen = await forwardedHeaders({
    "x-ceraghit-client-ip": "6.6.6.6",
    "x-ceraghit-proxy-secret": "guess",
    "x-ceraghit-other": "1",
    "x-forwarded-for": "203.0.113.7, 10.0.0.1",
  })
  expect(seen.get("x-ceraghit-client-ip")).toBe("203.0.113.7")
  expect(seen.get("x-ceraghit-proxy-secret")).toBe("p".repeat(32))
  expect(seen.get("x-ceraghit-other")).toBeNull()
})

test("without PROXY_SECRET nothing client-sent is forwarded as trusted", async () => {
  const seen = await forwardedHeaders({ "x-ceraghit-client-ip": "6.6.6.6", "x-real-ip": "203.0.113.7" })
  expect(seen.get("x-ceraghit-client-ip")).toBeNull()
  expect(seen.get("x-ceraghit-proxy-secret")).toBeNull()
})
