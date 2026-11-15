import { createHash } from "node:crypto"
import type { BrowserContext, Page } from "@playwright/test"
import { E2E } from "../../env"
import { expect, loginAsOwner, test } from "../../fixtures"
import { adminSessions, ageLimits, ageSession, completeSetup, type Db, openDb, rateLimits } from "../../helpers/db"

const COOKIE = "ceraghit_admin"
const LOGIN_FAILED = /Wrong email or password/
const LOCKED = /Too many attempts\. Try again in 15 minutes/
const ME = `${E2E.dashboardUrl}/api/rpc/admin/auth/me`

let db: Db

test.describe.configure({ mode: "serial" })

test.beforeAll(async () => {
  db = openDb()
  await completeSetup(db)
})

test.afterAll(async () => {
  await db.close()
})

test.beforeEach(async () => {
  await db.delete(rateLimits)
})

const sha = (token: string) => createHash("sha256").update(token).digest("hex")
const sessionCount = async () => (await db.select().from(adminSessions)).length

async function ownerCookie(context: BrowserContext) {
  return (await context.cookies(E2E.dashboardUrl)).find((c) => c.name === COOKIE)
}

async function signedIn(page: Page) {
  await expect(page.getByRole("heading", { name: "Vue d'ensemble" })).toBeVisible()
}

test("signed out visitors are sent to the login", async ({ page, step }) => {
  for (const path of ["/", "/products", "/orders", "/settings"]) {
    await step(`open ${path} without a cookie`, async () => {
      await page.goto(`${E2E.dashboardUrl}${path}`)
      await expect(page).toHaveURL(/\/login$/)
      await expect(page.getByLabel("Email")).toBeVisible()
    })
  }
})

test("login opens the overview with a safe session cookie", async ({ page, context, step }) => {
  const before = await sessionCount()
  await step("the empty login form", async () => {
    await page.goto(`${E2E.dashboardUrl}/login`)
    await expect(page.getByLabel("Mot de passe")).toBeVisible()
  })
  await step("sign in with the owner credentials", async () => {
    await loginAsOwner(page)
    await expect(page).toHaveURL(`${E2E.dashboardUrl}/`)
    await signedIn(page)
  })
  const cookie = await ownerCookie(context)
  expect(cookie?.httpOnly).toBe(true)
  expect(["Lax", "Strict"]).toContain(cookie?.sameSite)
  expect(await sessionCount()).toBe(before + 1)
  const rows = await db.select().from(adminSessions)
  expect(rows.some((r) => r.tokenHash === sha(cookie?.value ?? ""))).toBe(true)
})

test("wrong credentials show one message and open no session", async ({ page, context, step }) => {
  const before = await sessionCount()
  await step("wrong password", async () => {
    await loginAsOwner(page, "not-the-password")
    await expect(page.getByText(LOGIN_FAILED)).toBeVisible()
  })
  await step("unknown email gets the same message", async () => {
    await loginAsOwner(page, E2E.adminPassword, "nobody@e2e.local")
    await expect(page.getByText(LOGIN_FAILED)).toBeVisible()
  })
  expect(await ownerCookie(context)).toBeUndefined()
  expect(await sessionCount()).toBe(before)
})

test("five wrong attempts lock the address for 15 minutes", async ({ page, step }) => {
  await step("five wrong passwords", async () => {
    for (let i = 0; i < 5; i++) {
      await loginAsOwner(page, `wrong-${i}`, `guess${i}@e2e.local`)
      await expect(page.getByText(LOGIN_FAILED)).toBeVisible()
    }
  })
  await step("the right password is refused while locked", async () => {
    await loginAsOwner(page)
    await expect(page.getByText(LOCKED)).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  })
  await ageLimits(db, 15 * 60_000 + 1000, "login:ip:")
  await step("after 15 minutes the right password works", async () => {
    await loginAsOwner(page)
    await signedIn(page)
  })
})

test("logout deletes the session and the back button stays out", async ({ page, context, step }) => {
  await loginAsOwner(page)
  await signedIn(page)
  await page.goto(`${E2E.dashboardUrl}/orders`)
  const token = (await ownerCookie(context))?.value ?? ""
  await step("sign out from the menu", async () => {
    const out = page.getByRole("button", { name: E2E.adminEmail })
    if (!(await out.isVisible())) await page.getByRole("button", { name: "Menu" }).click()
    await out.click()
    await expect(page).toHaveURL(/\/login$/)
  })
  expect(await ownerCookie(context)).toBeUndefined()
  expect((await db.select().from(adminSessions)).some((r) => r.tokenHash === sha(token))).toBe(false)
  await step("back to /orders redirects to the login", async () => {
    await page.goto(`${E2E.dashboardUrl}/orders`)
    await expect(page).toHaveURL(/\/login$/)
  })
})

test("forged and expired cookies are refused", async ({ page, context, step }) => {
  await step("a forged cookie", async () => {
    await context.addCookies([{ name: COOKIE, value: "garbage", url: E2E.dashboardUrl }])
    await page.goto(`${E2E.dashboardUrl}/orders`)
    await expect(page).toHaveURL(/\/login$/)
  })
  await context.clearCookies()
  await loginAsOwner(page)
  await signedIn(page)
  const cookie = await ownerCookie(context)
  await step("a session past its 14 days", async () => {
    await ageSession(db, sha(cookie?.value ?? ""), new Date(Date.now() - 60_000))
    await page.goto(`${E2E.dashboardUrl}/orders`)
    await expect(page).toHaveURL(/\/login$/)
    const res = await page.request.post(ME, { data: { json: null } })
    expect(res.status()).toBe(401)
  })
})
