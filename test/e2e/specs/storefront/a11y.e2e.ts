import AxeBuilder from "@axe-core/playwright"
import type { Page } from "@playwright/test"
import { expect, test } from "../../fixtures"
import { catalogue, pickKinds } from "../../helpers/catalogue"

const SERIOUS = ["serious", "critical"]
/** Structure rules axe rates as moderate: a page without them is hard to navigate with a screen reader. */
const STRUCTURE = ["heading-order", "landmark-one-main", "page-has-heading-one", "region", "image-alt", "html-has-lang"]

/** Serious and critical violations, plus the structure rules: fast enough for every locale and viewport. */
async function expectNoViolations(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).analyze()
  const blocking = violations.filter((v) => SERIOUS.includes(v.impact ?? "") || STRUCTURE.includes(v.id))
  expect(blocking.map((v) => `${label}: ${v.id} (${v.impact}) ${v.help} ${v.nodes[0]?.target.join(" ")}`)).toEqual([])
}

test("the storefront has no serious accessibility violation", async ({ page, home, request, step }) => {
  test.slow()
  const { stocked } = pickKinds(await catalogue(request))
  const pages: [string, string][] = [
    ["home", "/"],
    ["shop", "/shop"],
    ["collection", `/shop/${stocked.category.slug}`],
    ["product", `/product/${stocked.slug}`],
    ["atelier", "/atelier"],
    ["custom request", "/custom"],
    ["cart", "/cart"],
    ["checkout", "/checkout"],
    ["legal", "/legal/terms"],
  ]
  for (const [label, path] of pages) {
    await step(label, async () => {
      await page.goto(home(path))
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
      await expectNoViolations(page, label)
    })
  }
  await step("404", async () => {
    await page.goto(home("/does-not-exist"))
    await expectNoViolations(page, "404")
  })
})

test("html carries the language and direction of the locale, and the skip link comes first", async ({
  page,
  home,
  appLocale,
  step,
}) => {
  await page.goto(home())
  await step("lang and dir", async () => {
    await expect(page.locator("html")).toHaveAttribute("lang", appLocale)
    await expect(page.locator("html")).toHaveAttribute("dir", appLocale === "ar" ? "rtl" : "ltr")
  })
  await step("the first tab stop is the skip link and it lands on the content", async () => {
    await page.keyboard.press("Tab")
    const skip = page.locator("a[href='#content']")
    await expect(skip).toBeFocused()
    await expect(skip).toBeVisible()
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/#content$/)
  })
})
