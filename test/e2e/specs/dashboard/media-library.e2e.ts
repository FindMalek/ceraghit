import type { Page } from "@playwright/test"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { dbQuery } from "../../helpers/catalogue"
import { completeSetup, openDb } from "../../helpers/db"
import { deleteProductsByPrefix, fillLocalized } from "../../helpers/products"
import { markMediaUnused, mediaById } from "../../support/media"
import { ADMIN, createProductWithImages, galleryNames, removeImages, uploadImage } from "../../support/media-upload"

const PREFIX = "e2e-med-"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
  await deleteProductsByPrefix(PREFIX)
})

test.afterAll(async () => {
  await deleteProductsByPrefix(PREFIX)
})

const tile = (page: Page, filename: string) => page.getByRole("button", { name: filename })

/** File names shown by the grid, top to bottom. */
async function gridNames(page: Page): Promise<string[]> {
  const labels = await page
    .locator("button[data-tile]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))
  return labels.map((l) => (l ?? "").replace(/, ouvrir$/, ""))
}

async function pickSort(page: Page, option: string): Promise<void> {
  await page.getByRole("combobox", { name: "Trier par" }).click()
  await page.getByRole("option", { name: option }).click()
}

test("the library sorts by name, size and use, and the detail panel renames, describes, tags and lists the usage", async ({
  page,
  step,
}) => {
  test.slow()
  const id = Date.now().toString(36)
  const names = { a: `lib-${id}-a.webp`, b: `lib-${id}-b.webp`, c: `lib-${id}-c.webp` }
  await loginAsOwnerAndWait(page)
  await page.goto(`${E2E.dashboardUrl}/media`)
  const ids: string[] = []
  const ref = `${PREFIX}${id}`.slice(0, 20)

  await step("three images of different weight, the middle one named first is the heaviest", async () => {
    ids.push(await uploadImage(page, `lib-${id}-b`, 300, 200))
    ids.push(await uploadImage(page, `lib-${id}-c`, 1600, 1200))
    ids.push(await uploadImage(page, `lib-${id}-a`, 900, 600))
    await createProductWithImages(page, ref, [ids[0] as string])
    await page.goto(`${E2E.dashboardUrl}/media?q=lib-${id}`)
    await expect(page.locator("button[data-tile]")).toHaveCount(3)
  })

  await step("sorted by name the grid reads a, b, c", async () => {
    await pickSort(page, "Nom (A à Z)")
    await expect.poll(() => gridNames(page)).toEqual([names.a, names.b, names.c])
  })

  await step("sorted by size the heaviest comes first, as the database orders them", async () => {
    await pickSort(page, "Taille")
    const rows = await dbQuery<{ filename: string }>(
      "select filename from media where filename like $1 order by bytes desc, id",
      [`lib-${id}-%`],
    )
    await expect.poll(() => gridNames(page)).toEqual(rows.map((r) => r.filename))
    expect(rows[0]?.filename).toBe(names.c)
  })

  await step("sorted by use, the image shown on a product comes first", async () => {
    await pickSort(page, "Les plus utilisées")
    await expect.poll(async () => (await gridNames(page))[0]).toBe(names.b)
  })

  await step("the detail panel lists the product that uses the image", async () => {
    await tile(page, `${names.b}, ouvrir`).click()
    const panel = page.getByRole("dialog", { name: "Détail de la photo" })
    await expect(panel.getByRole("link", { name: new RegExp(ref) })).toBeVisible()
    await expect(panel.getByText("Utilisée sur 1 page : retirez-la d'abord.")).toBeVisible()
    await expect(panel.getByRole("button", { name: "Supprimer" })).toBeDisabled()
    await page.keyboard.press("Escape")
  })

  await step("rename, alt text in three languages and tags are saved", async () => {
    await tile(page, `${names.a}, ouvrir`).click()
    const panel = page.getByRole("dialog", { name: "Détail de la photo" })
    await panel.getByLabel("Nom du fichier").fill(`renamed-${id}`)
    await fillLocalized(page, "media-alt", {
      fr: "Un plat bleu",
      en: "A blue dish",
      ar: "طبق أزرق",
    })
    const tags = panel.getByPlaceholder("Ajoutez un mot-clé puis Entrée")
    await tags.fill(`bleu-${id}`)
    await tags.press("Enter")
    await tags.fill(`temp-${id}`)
    await tags.press("Enter")
    await panel.getByRole("button", { name: `Retirer le mot-clé temp-${id}` }).click()
    await panel.getByRole("button", { name: "Enregistrer" }).click()
    await expect
      .poll(async () => {
        const [row] = await dbQuery<{ filename: string; alt: Record<string, string>; tags: string[] }>(
          "select filename, alt, tags from media where id = $1",
          [ids[2] as string],
        )
        return row
      })
      .toMatchObject({
        filename: `renamed-${id}.webp`,
        alt: { fr: "Un plat bleu", en: "A blue dish", ar: "طبق أزرق" },
        tags: [`bleu-${id}`],
      })
  })

  await step("the library finds the image by its new tag and its alt text", async () => {
    await page.goto(`${E2E.dashboardUrl}/media?tag=bleu-${id}`)
    await expect(tile(page, `renamed-${id}.webp, ouvrir`)).toBeVisible()
    await page.goto(`${E2E.dashboardUrl}/media?q=${encodeURIComponent("plat bleu")}`)
    await expect(tile(page, `renamed-${id}.webp, ouvrir`)).toBeVisible()
  })

  await deleteProductsByPrefix(PREFIX)
  await removeImages(page, ids)
})

test("the picker adds photos in the order chosen, replaces one, and a photo in use cannot be deleted", async ({
  page,
  step,
}) => {
  test.slow()
  const id = Date.now().toString(36)
  const ref = `${PREFIX}${id}`.slice(0, 20)
  const file = (n: number) => `pick-${id}-${n}.webp`
  await loginAsOwnerAndWait(page)
  await page.goto(`${E2E.dashboardUrl}/media`)
  const ids: string[] = []
  let productId = ""

  await step("five library images, one of them already on a new product", async () => {
    for (let n = 1; n <= 5; n++) ids.push(await uploadImage(page, `pick-${id}-${n}`, 300 + n * 10, 220))
    productId = await createProductWithImages(page, ref, [ids[0] as string])
    expect(await galleryNames(productId)).toEqual([file(1)])
  })

  await step("open the product and choose three photos in the picker, last one first", async () => {
    await page.goto(`${E2E.dashboardUrl}/products/${productId}`)
    await page.getByRole("button", { name: "Choisir dans la médiathèque" }).click()
    const picker = page.getByRole("dialog", { name: "Choisir dans la médiathèque" })
    await picker.getByRole("searchbox", { name: "Rechercher une photo" }).fill(`pick-${id}`)
    await expect(picker.locator("button[data-tile]")).toHaveCount(5)
    for (const n of [4, 2, 3]) await picker.getByRole("button", { name: file(n) }).click()
    await expect(picker.getByText("3 sélectionnées")).toBeVisible()
    await picker.getByRole("button", { name: "Choisir (3)" }).click()
    await expect(page.getByRole("list", { name: "Photos du produit" }).getByRole("listitem")).toHaveCount(4)
  })

  await step("saving keeps the picked order in the database", async () => {
    await page.getByRole("button", { name: "Enregistrer" }).click()
    await page.waitForURL(`${E2E.dashboardUrl}/products`)
    expect(await galleryNames(productId)).toEqual([file(1), file(4), file(2), file(3)])
  })

  await step("replace the second photo with another library image, same position", async () => {
    await page.goto(`${E2E.dashboardUrl}/products/${productId}`)
    await page.getByRole("button", { name: "Actions pour la photo 2" }).click()
    await page.getByRole("menuitem", { name: "Remplacer…" }).click()
    const picker = page.getByRole("dialog", { name: "Choisir dans la médiathèque" })
    await picker.getByRole("searchbox", { name: "Rechercher une photo" }).fill(`pick-${id}-5`)
    await picker.getByRole("button", { name: file(5) }).click()
    await picker.getByRole("button", { name: "Choisir", exact: true }).click()
    await page.getByRole("button", { name: "Enregistrer" }).click()
    await page.waitForURL(`${E2E.dashboardUrl}/products`)
    expect(await galleryNames(productId)).toEqual([file(1), file(5), file(2), file(3)])
  })

  await step("an image in use shows its product and the delete button is disabled", async () => {
    await page.goto(`${E2E.dashboardUrl}/media?q=pick-${id}-5`)
    await tile(page, `${file(5)}, ouvrir`).click()
    const panel = page.getByRole("dialog", { name: "Détail de la photo" })
    await expect(panel.getByRole("link", { name: new RegExp(ref) })).toBeVisible()
    await expect(panel.getByRole("button", { name: "Supprimer" })).toBeDisabled()
  })

  await step("the api refuses the same delete and keeps the row and the file", async () => {
    const res = await page.request.delete(`${E2E.apiUrl}/v1/admin/media/${ids[4]}`, { headers: ADMIN })
    expect(res.status()).toBe(409)
    expect(await mediaById(ids[4] as string)).not.toBeNull()
    await page.keyboard.press("Escape")
  })

  await step("the image the replacement freed is unused and can be deleted", async () => {
    await page.goto(`${E2E.dashboardUrl}/media?q=pick-${id}-4&filter=unused`)
    await tile(page, `${file(4)}, ouvrir`).click()
    const panel = page.getByRole("dialog", { name: "Détail de la photo" })
    await expect(panel.getByText("Nulle part pour le moment.")).toBeVisible()
    await panel.getByRole("button", { name: "Supprimer" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" }).click()
    await expect.poll(() => mediaById(ids[3] as string)).toBeNull()
    await expect(tile(page, `${file(4)}, ouvrir`)).toBeHidden()
  })
  await deleteProductsByPrefix(PREFIX)
  await removeImages(page, ids)
})

test("the reconcile job fixes a wrong size, drops a ghost row and a dry run changes nothing", async ({
  page,
  step,
}) => {
  test.slow()
  const id = Date.now().toString(36)
  await loginAsOwnerAndWait(page)
  const mediaId = await uploadImage(page, `reco-${id}`, 320, 240)
  const real = await mediaById(mediaId)
  const ghostKey = (real?.key ?? "").replace(/[^/]+$/, `ghost-${id}.webp`)
  const cron = (query = "") =>
    page.request.post(`${E2E.apiUrl}/cron/media-cleanup${query}`, {
      headers: { authorization: `Bearer ${E2E.cronSecret}` },
    })
  const uploadBytes = async (key: string) =>
    (await dbQuery<{ bytes: number }>("select bytes from uploads where key = $1", [key]))[0]?.bytes ?? null
  await markMediaUnused(mediaId, 0)

  await step("the counter of one file is wrong and a counted file no longer exists in the bucket", async () => {
    await dbQuery("update uploads set bytes = bytes + 5000 where key = $1", [real?.key ?? ""])
    await dbQuery(
      "insert into uploads (key, folder, content_type, bytes, created_at) values ($1, 'media', 'image/webp', 777, now() - interval '3 hours')",
      [ghostKey],
    )
    expect(await uploadBytes(real?.key ?? "")).toBe((real?.bytes ?? 0) + 5000)
    expect(await uploadBytes(ghostKey)).toBe(777)
  })

  await step("a dry run reports the drift and changes nothing", async () => {
    const res = await cron("?dryRun=1")
    expect(res.status()).toBe(200)
    const counts = (await res.json()) as { sizesFixed: number; rowsDropped: number }
    expect(counts.sizesFixed).toBeGreaterThanOrEqual(1)
    expect(counts.rowsDropped).toBeGreaterThanOrEqual(1)
    expect(await uploadBytes(real?.key ?? "")).toBe((real?.bytes ?? 0) + 5000)
    expect(await uploadBytes(ghostKey)).toBe(777)
  })

  await step("the real run restores the size and removes the ghost row", async () => {
    expect((await cron()).status()).toBe(200)
    expect(await uploadBytes(real?.key ?? "")).toBe(real?.bytes)
    expect(await uploadBytes(ghostKey)).toBeNull()
    expect(await mediaById(mediaId)).not.toBeNull()
  })

  await step("without the secret the job answers 401", async () => {
    expect((await page.request.post(`${E2E.apiUrl}/cron/media-cleanup`)).status()).toBe(401)
  })
  await removeImages(page, [mediaId])
})
