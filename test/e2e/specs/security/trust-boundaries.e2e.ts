import { request } from "node:http"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { BUYER } from "../../helpers/checkout"
import { pieceFor } from "../../support/catalogue"

const ONCE = { tag: ["@fr", "@desktop"] }
const FAKE_ID = "00000000-0000-4000-8000-000000000000"
const OPEN_ON_PURPOSE = new Set(["/admin/login", "/admin/logout"])

type Spec = { paths: Record<string, Record<string, unknown>> }

test("every admin route answers 401 to visitors and to forged cookies", ONCE, async ({ request }) => {
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
})

/** The request target goes out exactly as written, the way a client that does not normalise it would send it. */
function rawGet(
  port: number,
  path: string,
): Promise<{ status: number; setCookie: unknown; location: unknown; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "localhost", port, path, method: "GET" }, (res) => {
      let body = ""
      res.on("data", (chunk) => {
        body += chunk
      })
      res.on("end", () =>
        resolve({
          status: res.statusCode ?? 0,
          setCookie: res.headers["set-cookie"],
          location: res.headers.location,
          body,
        }),
      )
    })
    req.on("error", reject)
    req.end()
  })
}

const BLOCKED = { message: "Not found." }

test("each app's /api proxy only forwards its own namespace", ONCE, async ({ request: api }) => {
  await test.step("the storefront proxy answers its own 404 for a real admin procedure", async () => {
    for (const method of ["GET", "POST"]) {
      const res = await api.fetch(`${E2E.webUrl}/api/rpc/admin/products/list`, {
        method,
        headers: { "x-csrf-token": "orpc" },
        data: method === "POST" ? {} : undefined,
      })
      expect(res.status(), method).toBe(404)
      expect(await res.json(), method).toEqual(BLOCKED)
      expect(res.headers()["set-cookie"]).toBeUndefined()
    }
    const reachable = await api.get(`${E2E.dashboardUrl}/api/rpc/admin/products/list`, {
      headers: { "x-csrf-token": "orpc" },
    })
    expect(reachable.status(), "the same path is a real procedure behind the dashboard proxy").toBe(401)
    const login = await api.post(`${E2E.webUrl}/api/rpc/admin/auth/login`, {
      headers: { "x-csrf-token": "orpc" },
      data: { json: { email: E2E.adminEmail, password: E2E.adminPassword } },
    })
    expect(login.status()).toBe(404)
    expect(await login.json()).toEqual(BLOCKED)
    expect(login.headers()["set-cookie"]).toBeUndefined()
    const control = await api.post(`${E2E.dashboardUrl}/api/rpc/admin/auth/login`, {
      headers: { "x-csrf-token": "orpc" },
      data: { json: { email: E2E.adminEmail, password: "not-the-password" } },
    })
    expect(await control.json(), "the same path reaches the api behind the dashboard proxy").not.toEqual(BLOCKED)
    expect(control.headers()["set-cookie"]).toBeUndefined()
  })

  await test.step("traversal variants sent as raw request targets are never served", async () => {
    for (const path of [
      "/api/rpc/public/../admin/products/list",
      "/api/rpc/public/%2e%2e/admin/products/list",
      "/api/rpc//admin/products/list",
      "/api/RPC/admin/products/list",
      "/api/rpc/public%2f..%2fadmin/products/list",
    ]) {
      const res = await rawGet(E2E.ports.web, path)
      if (res.status === 308) {
        // Next folds the double slash into the plain path, which the step above proves is refused.
        expect(res.location, path).toMatch(/\/api\/rpc\/admin\/products\/list$/)
      } else {
        expect(res.status, path).toBeGreaterThanOrEqual(400)
        expect(res.status, path).toBeLessThan(500)
      }
      expect(res.setCookie, path).toBeUndefined()
      expect(res.body, path).not.toContain('"code":"UNAUTHORIZED"')
    }
  })

  await test.step("the dashboard proxy answers its own 404 for a public procedure", async () => {
    const res = await api.get(`${E2E.dashboardUrl}/api/rpc/public/products/list`, {
      headers: { "x-csrf-token": "orpc" },
    })
    expect(res.status()).toBe(404)
    expect(await res.json()).toEqual(BLOCKED)
  })
})

test("an order is only readable with its own token", ONCE, async ({ request: api, page }, testInfo) => {
  const piece = await pieceFor(page.request, testInfo)
  const place = async () => {
    const made = await api.post(`${E2E.apiUrl}/v1/orders`, {
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
    return (await made.json()) as { number: string; token: string }
  }
  const mine = await place()
  const other = await place()

  const own = await api.get(`${E2E.apiUrl}/v1/orders/${mine.number}?token=${mine.token}`)
  expect(own.status(), "the right token opens the order").toBe(200)

  for (const token of ["", "wrong-token", "0".repeat(32), other.token]) {
    const res = await api.get(`${E2E.apiUrl}/v1/orders/${mine.number}?token=${token}`)
    expect(res.status(), `token "${token}"`).toBe(404)
    expect(await res.text()).not.toContain(BUYER.email)
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
