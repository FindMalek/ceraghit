import { expect, test } from "bun:test"
import { buildCsp, HSTS, securityHeaders } from "../src/security"

const base = {
  nonce: "abc",
  appEnv: "production" as const,
  s3Endpoint: "https://s3.example.net/",
  s3PublicUrl: "https://cdn.example.com",
}

test("web policy takes the bucket hosts from env and forbids framing", () => {
  const csp = buildCsp({ ...base, app: "web" })
  expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'")
  expect(csp).toContain("img-src 'self' data: blob: https://s3.example.net https://cdn.example.com")
  expect(csp).toContain("connect-src 'self' https://s3.example.net;")
  expect(csp).toContain("frame-ancestors 'none'")
  expect(csp).toContain("frame-src 'none'")
  expect(csp).toContain("form-action 'self' https://*.konnect.network")
  expect(csp).toContain("upgrade-insecure-requests")
})

test("dashboard policy allows the youtube embed and its thumbnails, nothing else", () => {
  const csp = buildCsp({ ...base, app: "dashboard", webUrl: "https://shop.example.com/fr" })
  expect(csp).toContain("https://shop.example.com")
  expect(csp).toContain("frame-src https://www.youtube-nocookie.com;")
  expect(csp).toContain("https://i.ytimg.com")
  expect(csp).toContain("form-action 'self';")
})

test("the dashboard may play media from the bucket and the cdn, no other host", () => {
  const dashboard = buildCsp({ ...base, app: "dashboard" })
  expect(dashboard).toContain("media-src 'self' https://s3.example.net https://cdn.example.com;")
  expect(dashboard).not.toContain("media-src 'self' https://s3.example.net https://cdn.example.com https://")
  expect(buildCsp({ ...base, app: "web" })).toContain("media-src 'self';")
})

test("only the dashboard may compile the wasm the invoice pdf renderer ships as a data url", () => {
  const dashboard = buildCsp({ ...base, app: "dashboard" })
  expect(dashboard).toContain("'wasm-unsafe-eval'")
  expect(dashboard).toContain("connect-src 'self' data: https://s3.example.net;")
  expect(dashboard).not.toContain("'unsafe-eval'")
  const web = buildCsp({ ...base, app: "web" })
  expect(web).not.toContain("wasm-unsafe-eval")
  expect(web).not.toContain("data: https://s3.example.net;")
})

test("HSTS is sent in production only, and the dev server may eval", () => {
  expect(securityHeaders({ ...base, app: "web" })["Strict-Transport-Security"]).toBe(HSTS)
  expect(securityHeaders({ ...base, app: "web", appEnv: "preview" })["Strict-Transport-Security"]).toBeUndefined()
  const local = buildCsp({ app: "web", nonce: "abc", appEnv: "local", dev: true })
  expect(local).toContain("'unsafe-eval'")
  expect(local).not.toContain("upgrade-insecure-requests")
})

test("report only mode swaps the header name", () => {
  const headers = securityHeaders({ ...base, app: "web", reportOnly: true })
  expect(Object.keys(headers)).toContain("Content-Security-Policy-Report-Only")
  expect(Object.keys(headers)).not.toContain("Content-Security-Policy")
})
