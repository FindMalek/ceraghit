import { randomBytes } from "node:crypto"
import type { APIRequestContext } from "@playwright/test"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { completeSetup, openDb } from "../../helpers/db"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
})

const FAKE_ID = "00000000-0000-4000-8000-000000000000"
const HEADERS = { "x-csrf-token": "orpc" }
const PROVIDERS = ["konnect", "aramex", "groq"]
const DASHBOARD_PAGES = [
  "/",
  "/payments",
  "/shipping",
  "/settings",
  "/settings/profile",
  "/emails",
  "/categories",
  "/products",
  "/orders",
  "/media",
  "/requests",
]
const PUBLIC_PAGES = ["/", "/shop", "/atelier", "/en", "/ar"]

type Spec = { paths: Record<string, Record<string, unknown>> }
type Masked = { secrets: Record<string, { configured: boolean; hint: string | null }> }

const secretsOf = async (api: APIRequestContext, provider: string): Promise<Masked["secrets"]> =>
  ((await (await api.get(`${E2E.apiUrl}/v1/admin/integrations/${provider}`, { headers: HEADERS })).json()) as Masked)
    .secrets

async function clearVault(api: APIRequestContext): Promise<void> {
  for (const provider of ["aramex", "groq"])
    await api.delete(`${E2E.apiUrl}/v1/admin/integrations/${provider}`, { headers: HEADERS })
}

test("saved provider secrets never leave the vault, and a save that leaves a field out keeps it", {
  tag: ["@fr", "@desktop"],
}, async ({ page, step }) => {
  const suffix = randomBytes(6).toString("hex")
  const sentinel = { groq: `sk_e2e_groq_${suffix}`, aramexPassword: `pw_e2e_${suffix}`, aramexPin: `pin_e2e_${suffix}` }
  const all = Object.values(sentinel)
  const api = page.request
  const leaks: string[] = []
  const scan = (where: string, text: string) => {
    for (const value of all) if (text.includes(value)) leaks.push(`${where} holds ${value}`)
  }

  await loginAsOwnerAndWait(page)
  await clearVault(api)
  try {
    await step("the owner saves a Groq key and the Aramex password and pin", async () => {
      const groq = await api.put(`${E2E.apiUrl}/v1/admin/integrations/groq`, {
        headers: HEADERS,
        data: { secrets: { apiKey: sentinel.groq } },
      })
      expect(groq.ok(), await groq.text()).toBe(true)
      const aramex = await api.put(`${E2E.apiUrl}/v1/admin/integrations/aramex`, {
        headers: HEADERS,
        data: { secrets: { password: sentinel.aramexPassword, accountPin: sentinel.aramexPin } },
      })
      expect(aramex.ok(), await aramex.text()).toBe(true)
      scan("the groq save answer", await groq.text())
      scan("the aramex save answer", await aramex.text())
      await page.goto(`${E2E.dashboardUrl}/shipping`)
    })

    await step("every provider answers configured with a short hint, never the value", async () => {
      expect((await secretsOf(api, "groq")).apiKey).toEqual({ configured: true, hint: expect.stringMatching(/.{4}$/) })
      const aramex = await secretsOf(api, "aramex")
      expect(aramex.password?.configured).toBe(true)
      expect(aramex.accountPin?.configured).toBe(true)
      for (const provider of PROVIDERS)
        scan(
          `GET /admin/integrations/${provider}`,
          await (await api.get(`${E2E.apiUrl}/v1/admin/integrations/${provider}`, { headers: HEADERS })).text(),
        )
    })

    await step("no admin read route answers with a secret", async () => {
      const spec = (await (await api.get(`${E2E.apiUrl}/v1/openapi.json`)).json()) as Spec
      const reads = Object.entries(spec.paths).filter(([path, methods]) => path.startsWith("/admin/") && methods.get)
      expect(reads.length).toBeGreaterThan(15)
      for (const [path] of reads)
        for (const provider of path.includes("{provider}") ? PROVIDERS : [FAKE_ID]) {
          const url = path.replace(/\{provider\}/g, provider).replace(/\{[^}]+\}/g, FAKE_ID)
          scan(`GET ${url}`, await (await api.get(`${E2E.apiUrl}/v1${url}`, { headers: HEADERS })).text())
        }
    })

    await step("no dashboard page or its RSC payload carries a secret", async () => {
      for (const path of DASHBOARD_PAGES) {
        await page.goto(`${E2E.dashboardUrl}${path}`)
        scan(`dashboard ${path}`, await page.content())
        scan(
          `dashboard ${path} (RSC)`,
          await (await api.get(`${E2E.dashboardUrl}${path}`, { headers: { rsc: "1" } })).text(),
        )
      }
      await page.goto(`${E2E.dashboardUrl}/payments`)
    })

    await step("no storefront page or public read answers with a secret", async () => {
      for (const path of PUBLIC_PAGES) scan(`storefront ${path}`, await (await api.get(`${E2E.webUrl}${path}`)).text())
      for (const path of ["/settings", "/products", "/categories", "/locations"])
        scan(`GET /v1${path}`, await (await api.get(`${E2E.apiUrl}/v1${path}`)).text())
      await page.goto(E2E.webUrl)
    })

    await step("saving with a field left out keeps the stored secret, null clears only that one", async () => {
      const before = await secretsOf(api, "aramex")
      const kept = await api.put(`${E2E.apiUrl}/v1/admin/integrations/aramex`, {
        headers: HEADERS,
        data: { config: { userName: `e2e-${suffix}` } },
      })
      expect(kept.ok(), await kept.text()).toBe(true)
      expect((await secretsOf(api, "aramex")).password).toEqual(before.password)
      expect((await secretsOf(api, "aramex")).accountPin).toEqual(before.accountPin)

      const cleared = await api.put(`${E2E.apiUrl}/v1/admin/integrations/aramex`, {
        headers: HEADERS,
        data: { secrets: { password: null } },
      })
      expect(cleared.ok(), await cleared.text()).toBe(true)
      const after = await secretsOf(api, "aramex")
      expect(after.password?.configured).toBe(false)
      expect(after.accountPin).toEqual(before.accountPin)
      await page.goto(`${E2E.dashboardUrl}/shipping`)
    })

    expect(leaks).toEqual([])
  } finally {
    await clearVault(api)
  }
})
