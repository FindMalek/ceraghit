import { admins as adminsTable } from "@workspace/db"
import { seed } from "@workspace/db/seed"
import { eq } from "drizzle-orm"
import { E2E } from "../../env"
import { expect, loginAsOwner, loginAsOwnerAndWait, test } from "../../fixtures"
import { adminSessions, completeSetup, type Db, openDb, rateLimits } from "../../helpers/db"

const NEW_PASSWORD = "une-phrase-de-passe-solide"
const NO_OVERFLOW = () => document.documentElement.scrollWidth <= window.innerWidth

let db: Db
let saved: { passwordHash: string; sessions: (typeof adminSessions.$inferSelect)[] }

const owner = async () =>
  (await db.select().from(adminsTable).where(eq(adminsTable.email, E2E.adminEmail.toLowerCase())))[0]!

test.describe.configure({ mode: "serial" })

test.beforeAll(async () => {
  db = openDb()
  await completeSetup(db)
  await db.delete(rateLimits)
  saved = { passwordHash: (await owner()).passwordHash, sessions: await db.select().from(adminSessions) }
})

/** Puts the owner back exactly as the other specs expect: same hash, same saved sessions. */
test.afterAll(async () => {
  await db
    .update(adminsTable)
    .set({ passwordHash: saved.passwordHash })
    .where(eq(adminsTable.id, (await owner()).id))
  await db.delete(adminSessions)
  if (saved.sessions.length > 0) await db.insert(adminSessions).values(saved.sessions)
  await db.delete(rateLimits)
  await db.close()
})

test("the owner changes their password: wrong current refused, other devices signed out, a re-bootstrap keeps it", async ({
  page,
  browser,
  step,
}) => {
  const oldHash = (await owner()).passwordHash
  const form = (label: string) => page.getByLabel(label, { exact: true })
  const submit = () => page.getByRole("button", { name: "Enregistrer" }).last().click()
  const fill = async (current: string, next: string, again: string) => {
    await form("Mot de passe actuel").fill(current)
    await form("Nouveau mot de passe").fill(next)
    await form("Confirmer le nouveau mot de passe").fill(again)
  }

  const other = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "10.77.0.1" } })
  const otherPage = await other.newPage()
  await loginAsOwnerAndWait(page)
  await loginAsOwner(otherPage)
  await otherPage.waitForURL((url) => !url.pathname.startsWith("/login"))

  await step("the screen sits on the profile page", async () => {
    await page.goto(`${E2E.dashboardUrl}/settings/profile`)
    await expect(page.getByText("Changer mon mot de passe")).toBeVisible()
    await page.getByText("Changer mon mot de passe").scrollIntoViewIfNeeded()
    expect(await page.evaluate(NO_OVERFLOW)).toBe(true)
  })

  await step("a wrong current password is refused and nothing changes", async () => {
    await fill("pas-le-bon-mot-de-passe", NEW_PASSWORD, NEW_PASSWORD)
    await submit()
    await expect(page.getByText("Le mot de passe actuel est incorrect.")).toBeVisible()
    expect((await owner()).passwordHash).toBe(oldHash)
  })

  await step("a short or mismatched new password is refused before the api is called", async () => {
    await fill(E2E.adminPassword, "court", "court")
    await submit()
    await expect(page.getByText("au moins 12 caractères.")).toBeVisible()
    await fill(E2E.adminPassword, NEW_PASSWORD, "autre-chose-autre-chose")
    await submit()
    await expect(page.getByText("Les deux mots de passe ne correspondent pas.")).toBeVisible()
    expect((await owner()).passwordHash).toBe(oldHash)
  })

  await step("the right current password saves, and this session stays signed in", async () => {
    await fill(E2E.adminPassword, NEW_PASSWORD, NEW_PASSWORD)
    await submit()
    await expect(page.getByText("Enregistré").last()).toBeVisible()
    await expect(form("Mot de passe actuel")).toHaveValue("")
    expect((await owner()).passwordHash).not.toBe(oldHash)
    await page.reload()
    await expect(page.getByText("Changer mon mot de passe")).toBeVisible()
  })

  await step(
    "the other device is signed out",
    async () => {
      await otherPage.goto(`${E2E.dashboardUrl}/settings/profile`)
      await expect(otherPage).toHaveURL(/\/login$/)
    },
    otherPage,
  )

  await step("the old password no longer signs in, the new one does", async () => {
    await db.delete(rateLimits)
    const fresh = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "10.77.0.2" } })
    const freshPage = await fresh.newPage()
    await loginAsOwner(freshPage)
    await expect(freshPage.getByText(/Email ou mot de passe incorrect/)).toBeVisible()
    await loginAsOwner(freshPage, NEW_PASSWORD)
    await freshPage.waitForURL((url) => !url.pathname.startsWith("/login"))
    await fresh.close()
  })

  await step("a re-bootstrap (the deploy) keeps the changed password", async () => {
    const changed = (await owner()).passwordHash
    await seed(db, { admin: { email: E2E.adminEmail, password: E2E.adminPassword } })
    expect((await owner()).passwordHash).toBe(changed)
  })

  await other.close()
})
