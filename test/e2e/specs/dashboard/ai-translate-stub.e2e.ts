import type { Page } from "@playwright/test"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { completeSetup, openDb } from "../../helpers/db"
import { groqRequests, setGroqMode } from "../../support/stubs"

const CSRF = { "x-csrf-token": "orpc" }
const KEY = "gsk_e2e_stub_key_0000"
const CAP = { model: "openai/gpt-oss-120b", reasoningEffort: "low" }

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
})

const saveCap = (page: Page, monthlyCapUsd: number | null) =>
  page.request.put(`${E2E.apiUrl}/v1/admin/ai/settings`, { headers: CSRF, data: { ...CAP, monthlyCapUsd } })

const translate = (page: Page, values: { fr: string; en: string; ar: string }) =>
  page.request.post(`${E2E.apiUrl}/v1/admin/ai/translate`, {
    headers: CSRF,
    data: { field: "category.name", values },
    timeout: 60_000,
  })

const nameField = (page: Page) => page.locator('[data-slot="field"]').filter({ has: page.locator("#cat-name") })

test.describe.configure({ mode: "serial" })

test.describe("AI translation through the Groq stub", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwnerAndWait(page)
    await setGroqMode("ok")
    await saveCap(page, 5)
    const res = await page.request.put(`${E2E.apiUrl}/v1/admin/integrations/groq`, {
      headers: CSRF,
      data: { provider: "groq", secrets: { apiKey: KEY } },
    })
    expect(res.ok()).toBe(true)
  })

  test.afterEach(async ({ page }) => {
    await saveCap(page, 5)
    await page.request.delete(`${E2E.apiUrl}/v1/admin/integrations/groq`, { headers: CSRF })
  })

  test("the owner drafts the English and Arabic of a category from the French", { tag: ["@fr", "@desktop"] }, async ({
    page,
    step,
    shot,
  }) => {
    await step("the settings page shows the Groq key as configured", async () => {
      await page.goto(`${E2E.dashboardUrl}/settings`)
      await expect(page.getByText("Clé Groq configurée")).toBeVisible()
      await shot("groq-configured")
    })

    await step("Traduire fills the empty languages and marks them as drafts", async () => {
      await page.goto(`${E2E.dashboardUrl}/categories`)
      await page.getByRole("button", { name: "Nouvelle catégorie" }).click()
      await page.locator("#cat-name").fill("Vase en grès émaillé")
      await nameField(page).getByRole("button", { name: "Traduire" }).click()
      await expect(page.getByText("Traduction automatique, relisez avant d'enregistrer.")).toBeVisible()
      await expect(page.locator("#cat-name")).toHaveValue(/Hand-glazed stoneware vase/)
      await nameField(page).getByRole("tab", { name: "العربية auto" }).click()
      await expect(page.locator("#cat-name")).toHaveValue(/مزهرية من الخزف الحجري/)
    })

    await step("the call went to the stub with the saved key and the default model", async () => {
      const [request] = await groqRequests()
      expect(request).toMatchObject({ model: "openai/gpt-oss-120b", auth: true })
      expect(request?.targets.sort()).toEqual(["ar", "en"])
    })
  })

  test("a rate limited main model falls back to the small one", { tag: ["@fr", "@desktop"] }, async ({
    page,
    step,
  }) => {
    await step("the main model answers 429 and the fallback answers", async () => {
      await setGroqMode("rate_limit")
      const res = await translate(page, { fr: "Vase en grès", en: "", ar: "" })
      expect(res.ok()).toBe(true)
      expect(((await res.json()) as { values: { en: string } }).values.en).toContain("stoneware")
      const models = new Set((await groqRequests()).map((r) => r.model))
      expect([...models].sort()).toEqual(["openai/gpt-oss-120b", "openai/gpt-oss-20b"])
    })
  })

  test("a provider that is down gives a safe message and writes nothing", { tag: ["@fr", "@desktop"] }, async ({
    page,
    step,
  }) => {
    await step("both models fail", async () => {
      await setGroqMode("down")
      const res = await translate(page, { fr: "Vase en grès", en: "", ar: "" })
      expect(res.status()).toBe(502)
      const body = JSON.stringify(await res.json())
      expect(body).toContain("Le service de traduction ne répond pas")
      expect(body).not.toContain(KEY)
    })
  })

  test("a malformed answer is treated as a failure", { tag: ["@fr", "@desktop"] }, async ({ page, step }) => {
    await step("the answer is not json", async () => {
      await setGroqMode("malformed")
      const res = await translate(page, { fr: "Vase en grès", en: "", ar: "" })
      expect(res.status()).toBe(502)
    })
  })

  test("a hung main model times out and the fallback answers", { tag: ["@fr", "@desktop"] }, async ({ page, step }) => {
    test.setTimeout(120_000)
    await step("the main model never answers", async () => {
      await setGroqMode("hang")
      const res = await translate(page, { fr: "Vase en grès", en: "", ar: "" })
      expect(res.ok()).toBe(true)
      expect(((await res.json()) as { values: { ar: string } }).values.ar).toContain("مزهرية")
    })
  })

  test("an answer over the field limit is retried once and flagged", { tag: ["@fr", "@desktop"] }, async ({
    page,
    step,
  }) => {
    await step("the second answer is still too long", async () => {
      await setGroqMode("too_long")
      const res = await translate(page, { fr: "Vase en grès", en: "", ar: "" })
      expect(res.ok()).toBe(true)
      expect(((await res.json()) as { warnings: string[] }).warnings).toContain("length")
      expect(await groqRequests()).toHaveLength(2)
    })
  })

  test("the monthly cap blocks the call before Groq is asked", { tag: ["@fr", "@desktop"] }, async ({
    page,
    step,
    shot,
  }) => {
    await step("with a cap of zero the API refuses", async () => {
      await saveCap(page, 0)
      const res = await translate(page, { fr: "Vase en grès", en: "", ar: "" })
      expect(res.status()).toBe(403)
      expect(JSON.stringify(await res.json())).toContain("Limite mensuelle de traduction atteinte")
      expect(await groqRequests()).toHaveLength(0)
    })

    await step("the form's Traduire button is disabled", async () => {
      await page.goto(`${E2E.dashboardUrl}/categories`)
      await page.getByRole("button", { name: "Nouvelle catégorie" }).click()
      await page.locator("#cat-name").fill("Vase en grès")
      await expect(nameField(page).getByRole("button", { name: "Traduire" })).toBeDisabled()
      await shot("groq-cap-reached")
    })
  })

  test("without a key the API asks for one and calls nothing", { tag: ["@fr", "@desktop"] }, async ({ page, step }) => {
    await step("no key saved", async () => {
      await page.request.delete(`${E2E.apiUrl}/v1/admin/integrations/groq`, { headers: CSRF })
      const res = await translate(page, { fr: "Vase en grès", en: "", ar: "" })
      expect(res.status()).toBe(412)
      expect(JSON.stringify(await res.json())).toContain("Ajoutez une clé Groq")
      expect(await groqRequests()).toHaveLength(0)
    })
  })
})
