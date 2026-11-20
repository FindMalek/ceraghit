import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { BUYER } from "../../helpers/checkout"
import { pieceFor } from "../../support/catalogue"

const ONCE = { tag: ["@fr", "@desktop"] }
const FAKE_ID = "00000000-0000-4000-8000-000000000000"
const OPEN_ON_PURPOSE = new Set(["/admin/login", "/admin/logout"])

type Spec = { paths: Record<string, Record<string, unknown>> }

test(
  "every admin route answers 401 to visitors, forged cookies and the proxies of the other app",
  ONCE,
  async ({ request }) => {
    const spec = (await (await request.get(`${E2E.apiUrl}/v1/openapi.json`)).json()) as Spec
    const routes = Object.entries(spec.paths)
      .filter(([path]) => path.startsWith("/admin/") && !OPEN_ON_PURPOSE.has(path))
      .flatMap(([path, methods]) =>
        Object.keys(methods)
          .filter((m) => ["get", "post", "put", "patch", "delete"].includes(m))
          .map((method) => ({ method: method.toUpperCase(), url: path.replace(/\{[^}]+\}/g, FAKE_ID) })),
      )
    expect(routes.length).toBeGreaterThan(30)

    const open: string[] = []
    for (const { method, url } of routes) {
      for (const cookie of [undefined, "ceraghit_admin=forged"]) {
        const res = await request.fetch(`${E2E.apiUrl}/v1${url}`, {
          method,
          headers: { "x-csrf-token": "orpc", ...(cookie ? { cookie } : {}) },
          data: method === "GET" || method === "DELETE" ? undefined : {},
        })
        if (res.status() !== 401) open.push(`${method} ${url} ${cookie ? "forged" : "anonymous"} -> ${res.status()}`)
      }
    }
    expect(open).toEqual([])
  },
)

test("each app's /api proxy only forwards its own namespace", ONCE, async ({ request }) => {
  const sneaky = [
    "/api/rpc/admin/me",
    "/api/rpc/public/../admin/me",
    "/api/rpc/public/%2e%2e/admin/me",
    "/api/rpc//admin/me",
    "/api/RPC/admin/me",
  ]
  for (const path of sneaky) {
    const res = await request.get(`${E2E.webUrl}${path}`)
    expect(res.status(), `web ${path}`).toBeGreaterThanOrEqual(400)
    expect(res.headers()["set-cookie"], `web ${path}`).toBeUndefined()
  }
  const login = await request.post(`${E2E.webUrl}/api/rpc/admin/login`, {
    headers: { "x-csrf-token": "orpc" },
    data: { json: { email: E2E.adminEmail, password: E2E.adminPassword } },
  })
  expect(login.status()).toBeGreaterThanOrEqual(400)
  expect(login.headers()["set-cookie"]).toBeUndefined()

  for (const path of ["/api/rpc/public/products/list", "/api/rpc/public/../public/products/list"]) {
    const res = await request.get(`${E2E.dashboardUrl}${path}`)
    expect(res.status(), `dashboard ${path}`).toBeGreaterThanOrEqual(400)
  }
})

test("an order is only readable with its own token", ONCE, async ({ request, page }, testInfo) => {
  const piece = await pieceFor(page.request, testInfo)
  const made = await request.post(`${E2E.apiUrl}/v1/orders`, {
    data: {
      items: [{ productId: piece.id, quantity: 1 }],
      currency: "TND",
      locale: "fr",
      paymentMethod: "cod",
      country: "TN",
      ...BUYER,
    },
  })
  expect(made.ok()).toBe(true)
  const { number } = (await made.json()) as { number: string }
  for (const token of ["", "wrong-token", "0".repeat(32)]) {
    const res = await request.get(`${E2E.apiUrl}/v1/orders/${number}?token=${token}`)
    expect(res.status(), `token "${token}"`).toBe(404)
    const text = await res.text()
    expect(text).not.toContain(BUYER.email)
  }
})

test(
  "the owner cookie is http-only and the pages carry the security headers",
  ONCE,
  async ({ page, request, step }) => {
    await step("the owner signs in", async () => {
      await loginAsOwnerAndWait(page)
    })
    await step("the session cookie is http-only and hidden from scripts", async () => {
      const cookie = (await page.context().cookies(E2E.dashboardUrl)).find((c) => c.name === "ceraghit_admin")
      expect(cookie?.httpOnly).toBe(true)
      expect(cookie?.path).toBe("/")
      expect(cookie?.sameSite).not.toBe("None")
      expect(await page.evaluate(() => document.cookie)).not.toContain("ceraghit_admin")
    })

    const web = (await request.get(`${E2E.webUrl}/`)).headers()
    expect(web["x-frame-options"]).toBe("DENY")
    expect(web["referrer-policy"]).toBe("strict-origin-when-cross-origin")
    const dashboard = (await request.get(`${E2E.dashboardUrl}/login`)).headers()
    expect(dashboard["x-frame-options"]).toBe("DENY")
    expect(dashboard["x-robots-tag"]).toContain("noindex")
  },
)
