import { randomInt, randomUUID } from "node:crypto"
import { expect, mailWithSubject, test } from "../../fixtures"
import { dbQuery } from "../../helpers/catalogue"
import { t } from "../../helpers/messages"

test("an empty custom request shows every required error and sends nothing", async ({
  page,
  home,
  appLocale,
  step,
}) => {
  await page.goto(home("/custom"))
  await step("submit empty", async () => {
    await page.getByRole("button", { name: t(appLocale, "custom.submit") }).click()
    for (const key of ["name", "email", "description"]) {
      await expect(page.getByText(t(appLocale, `custom.errors.${key}`))).toBeVisible()
    }
    await expect(page.getByLabel(t(appLocale, "custom.name"))).toBeFocused()
    await expect(page.getByRole("status")).toHaveCount(0)
  })
})

test("a custom request is stored and mailed to the studio", async ({ page, home, appLocale, step }) => {
  const id = randomUUID().slice(0, 8)
  const email = `buyer+${id}@example.test`
  const name = `Buyer ${id}`
  await page
    .context()
    .setExtraHTTPHeaders({ "x-forwarded-for": `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}` })
  await page.goto(home("/custom"))
  await step("fill the form", async () => {
    await page.getByLabel(t(appLocale, "custom.name")).fill(name)
    await page.getByLabel(t(appLocale, "custom.email")).fill(email)
    await page.getByLabel(t(appLocale, "custom.phone")).fill("+21620000000")
    await page.getByLabel(t(appLocale, "custom.country")).fill("Tunisie")
    await page.getByLabel(t(appLocale, "custom.description")).fill("A tall vase with a speckled glaze, e2e request")
    await page.getByLabel(t(appLocale, "custom.dimensions")).fill("40 cm")
    await page.getByLabel(t(appLocale, "custom.budget")).fill("300")
  })
  await step("send it", async () => {
    const submit = page.getByRole("button", { name: t(appLocale, "custom.submit") })
    await expect(submit).toBeEnabled()
    await submit.click()
    await expect(page.getByText(t(appLocale, "custom.successTitle"))).toBeVisible()
  })
  const [row] = await dbQuery<{ name: string; dimensions: string; budget: string; locale: string }>(
    "select name, dimensions, budget, locale from custom_requests where email = $1",
    [email],
  )
  expect(row).toMatchObject({ name, dimensions: "40 cm", budget: "300", locale: appLocale })
  const mail = await mailWithSubject(name)
  expect(mail.text).toContain("A tall vase")
})
