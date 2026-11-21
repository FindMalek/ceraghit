import { uploads } from "@workspace/db"
import { STORAGE_QUOTA_BYTES } from "@workspace/sdk"
import { like, sql } from "drizzle-orm"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { completeSetup, openDb } from "../../helpers/db"

const PREFIX = "e2e-meter/"

/** Rows in `uploads` so that the counter sits at `share` of the plan (a column holds at most 2 GB). */
async function fillTo(share: number): Promise<void> {
  const db = openDb()
  await db.delete(uploads).where(like(uploads.key, `${PREFIX}%`))
  const [row] = await db.select({ used: sql<number>`coalesce(sum(${uploads.bytes}), 0)::bigint` }).from(uploads)
  const missing = Math.ceil(STORAGE_QUOTA_BYTES * share) - Number(row?.used ?? 0)
  const chunks = Math.ceil(missing / 1_000_000_000)
  await db.insert(uploads).values(
    Array.from({ length: chunks }, (_, i) => ({
      key: `${PREFIX}${share}-${i}.webp`,
      folder: "media",
      contentType: "image/webp",
      bytes: Math.ceil(missing / chunks),
    })),
  )
  await db.close()
}

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
})
test.afterAll(async () => {
  const db = openDb()
  await db.delete(uploads).where(like(uploads.key, `${PREFIX}%`))
  await db.close()
})

test("the storage meter warns at 80% and stops uploads at 100%", { tag: ["@fr"] }, async ({ page, step }) => {
  await loginAsOwnerAndWait(page)
  await step("at 85% the meter warns and links to the unused photos", async () => {
    await fillTo(0.85)
    await page.goto(`${E2E.dashboardUrl}/media`)
    await expect(page.getByText(/Le stockage est presque plein \(85 %\)/)).toBeVisible()
    await expect(page.getByRole("link", { name: "Voir les photos inutilisées" })).toHaveAttribute(
      "href",
      "/media?unused=1",
    )
    await expect(page.getByRole("button", { name: "Ajouter des photos" })).toBeEnabled()
  })
  await step("at 100% the message is clear and the upload button is disabled", async () => {
    await fillTo(1)
    await page.goto(`${E2E.dashboardUrl}/media`)
    await expect(page.getByRole("alert").filter({ hasText: "Le stockage est plein" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Ajouter des photos" })).toBeDisabled()
  })
})
