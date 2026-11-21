import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { completeSetup, openDb } from "../../helpers/db"
import { PUBLISHED, publishTutorialFixtures, removeTutorialFixtures } from "../../helpers/tutorials"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
  await publishTutorialFixtures()
})

test.afterAll(removeTutorialFixtures)

const help = `${E2E.dashboardUrl}/help`

test("search narrows the library without accents or case, and an empty result offers a reset", {
  tag: ["@fr"],
}, async ({ page, step }) => {
  await loginAsOwnerAndWait(page)
  await page.goto(help)
  const cards = page.getByRole("list", { name: "Vidéos" }).getByRole("button")
  const search = page.getByRole("searchbox", { name: "Rechercher une vidéo" })

  await step("the library lists every video", async () => {
    await expect(cards).toHaveCount(99)
    await expect(page.getByText("99 vidéos")).toBeVisible()
  })
  await step("a search without accents or capitals finds the video and keeps the query in the url", async () => {
    await search.fill("RECHERCHER piece")
    await expect(page.getByRole("button", { name: /Rechercher une pièce/ })).toBeVisible()
    await expect(cards.first()).toBeVisible()
    await expect.poll(() => cards.count()).toBeLessThan(10)
    await expect(page).toHaveURL(/[?&]q=RECHERCHER(\+|%20)piece/)
  })
  await step("a search with no match shows the empty state and a reset", async () => {
    await search.fill("zzzz-aucune-video")
    await expect(page.getByText("Aucune vidéo ne correspond à cette recherche.")).toBeVisible()
    await expect(cards).toHaveCount(0)
    await page.getByRole("button", { name: "Voir toutes les vidéos" }).click()
    await expect(search).toHaveValue("")
    await expect(cards).toHaveCount(99)
    await expect(page).not.toHaveURL(/q=/)
  })
})

test("the area chips narrow the list and the reset button brings it back", { tag: ["@fr"] }, async ({ page, step }) => {
  await loginAsOwnerAndWait(page)
  await page.goto(help)
  const cards = page.getByRole("list", { name: "Vidéos" }).getByRole("button")
  await expect(cards).toHaveCount(99)

  await step("the emails area keeps only its videos", async () => {
    await page.getByRole("button", { name: "Emails et automatismes" }).click()
    await expect(cards).toHaveCount(9)
    await expect(page).toHaveURL(/area=emails/)
  })
  await step("reset shows everything again", async () => {
    await page.getByRole("button", { name: "Réinitialiser les filtres" }).click()
    await expect(cards).toHaveCount(99)
    await expect(page).not.toHaveURL(/area=/)
  })
})

test("a video link opens the player with its hosted file and captions, Esc closes it", { tag: ["@fr"] }, async ({
  page,
  step,
  request,
}) => {
  await loginAsOwnerAndWait(page)
  const mobile = (page.viewportSize()?.width ?? 1440) < 768
  const device = mobile ? "mobile" : "desktop"
  await page.addInitScript(() => {
    const seen: string[] = []
    ;(window as unknown as { csp: string[] }).csp = seen
    document.addEventListener("securitypolicyviolation", (e) => seen.push(`${e.violatedDirective} ${e.blockedURI}`))
  })
  await page.goto(`${help}?video=${PUBLISHED}`)
  const player = page.getByRole("dialog", { name: "Rechercher une pièce" })

  await step("the player opens on the version of this screen, with French captions", async () => {
    await expect(player).toBeVisible()
    const video = player.locator("video")
    await expect(video).toHaveAttribute("src", `/api/files/tutorials/${PUBLISHED}-${device}.mp4`)
    await expect(video).toHaveAttribute("poster", `/api/files/tutorials/${PUBLISHED}.jpg`)
    await expect(video.locator("track")).toHaveAttribute("srclang", "fr")
    await expect(video.locator("track")).toHaveAttribute("src", `/api/files/tutorials/${PUBLISHED}-${device}.vtt`)
    await expect(player.getByRole("heading", { name: "Vidéos liées" })).toBeVisible()
  })
  await step("the video really loads and plays, its captions load, and the policy blocks nothing", async () => {
    const video = player.locator("video")
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(1)
    await video.evaluate(async (v: HTMLVideoElement) => {
      v.muted = true
      await v.play()
    })
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0)
    expect(await video.evaluate((v: HTMLVideoElement) => v.error)).toBeNull()
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.textTracks[0]?.cues?.length ?? 0))
      .toBeGreaterThan(0)
    expect(await page.evaluate(() => (window as unknown as { csp: string[] }).csp)).toEqual([])
  })
  await step("the file is served through the dashboard proxy", async () => {
    const res = await request.get(`${E2E.dashboardUrl}/api/files/tutorials/${PUBLISHED}-${device}.mp4`)
    expect(res.ok()).toBe(true)
    expect((await res.body()).length).toBeGreaterThan(100)
  })
  await step("the other version is one click away", async () => {
    const other = mobile ? "Ordinateur" : "Téléphone"
    await player.getByRole("button", { name: other }).click()
    await expect(player.locator("video")).toHaveAttribute(
      "src",
      `/api/files/tutorials/${PUBLISHED}-${mobile ? "desktop" : "mobile"}.mp4`,
    )
  })
  await step("Escape closes it and drops the link from the url", async () => {
    await page.keyboard.press("Escape")
    await expect(player).toBeHidden()
    await expect(page).not.toHaveURL(/video=/)
  })
})

test("a video that is not ready says Bientôt on its card and in the player", { tag: ["@fr"] }, async ({
  page,
  step,
}) => {
  await loginAsOwnerAndWait(page)
  await page.goto(help)
  const card = page.getByRole("button", { name: "Payer avec un lien Payoneer (bientôt disponible)" })

  await step("the card carries the Bientôt badge, the published one does not", async () => {
    await expect(card).toContainText("Bientôt")
    await expect(page.getByRole("button", { name: "Regarder : Rechercher une pièce" })).not.toContainText("Bientôt")
  })
  await step("opening it shows the waiting message, not a broken player", async () => {
    await card.click()
    const player = page.getByRole("dialog", { name: "Payer avec un lien Payoneer" })
    await expect(player.getByText("Vidéo bientôt disponible")).toBeVisible()
    await expect(player.locator("video")).toHaveCount(0)
  })
})

test("the YouTube links sheet lists the hosted videos and filters them by title", { tag: ["@fr"] }, async ({
  page,
  step,
}) => {
  await loginAsOwnerAndWait(page)
  await page.goto(help)
  await page.getByRole("button", { name: "Liens YouTube" }).click()
  const sheet = page.getByRole("dialog", { name: "Liens YouTube" })
  const first = sheet.getByText("01 · Découvrir la page d'accueil")

  await step("every video that is not marked soon has its two fields", async () => {
    await expect(first).toBeVisible()
    await expect(sheet.locator("fieldset")).toHaveCount(91)
  })
  await step("a video made for one device only asks for that device's link", async () => {
    await expect(sheet.locator("fieldset", { hasText: "97 · Démo" }).getByRole("textbox")).toHaveCount(1)
    await expect(sheet.locator("fieldset", { hasText: "01 · Découvrir" }).getByRole("textbox")).toHaveCount(2)
  })
  await step("searching keeps only the matching videos", async () => {
    await sheet.getByRole("searchbox", { name: "Chercher une vidéo à modifier" }).fill("FACTURE")
    await expect(sheet.getByText("46 · Émettre et imprimer une facture")).toBeVisible()
    await expect(first).toBeHidden()
    await sheet.getByRole("searchbox").fill("zzzz")
    await expect(sheet.getByText("Aucune vidéo ne correspond.")).toBeVisible()
  })
})
