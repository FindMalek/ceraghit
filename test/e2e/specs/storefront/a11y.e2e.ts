import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "../../fixtures"
import { catalogue, pickKinds } from "../../helpers/catalogue"

const SERIOUS = ["serious", "critical"]

/** Only serious and critical: fast enough for every locale and viewport, still catches real blockers. */
async function expectNoSeriousViolations(page: import("@playwright/test").Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).analyze()
  const blocking = violations.filter((v) => SERIOUS.includes(v.impact ?? ""))
  expect(blocking.map((v) => `${label}: ${v.id} (${v.impact}) ${v.help}`)).toEqual([])
}

test("the storefront has no serious accessibility violation", async ({ page, home, request, step }) => {
  const { stocked } = pickKinds(await catalogue(request))
  await step("home", async () => {
    await page.goto(home())
    await expectNoSeriousViolations(page, "home")
  })
  await step("shop", async () => {
    await page.goto(home("/shop"))
    await expectNoSeriousViolations(page, "shop")
  })
  await step("product", async () => {
    await page.goto(home(`/product/${stocked.slug}`))
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await expectNoSeriousViolations(page, "product")
  })
  await step("cart", async () => {
    await page.goto(home("/cart"))
    await expectNoSeriousViolations(page, "cart")
  })
})
