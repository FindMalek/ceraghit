import AxeBuilder from "@axe-core/playwright"
import type { Page } from "@playwright/test"
import { expect, test } from "../../fixtures"
import { catalogue, pickKinds } from "../../helpers/catalogue"
import { t } from "../../helpers/messages"

async function seriousViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze()
  return violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)
}

test("storefront pages have no critical or serious accessibility violations", { tag: ["@fr"] }, async ({
  page,
  request,
  home,
  appLocale,
}) => {
  const { stocked } = pickKinds(await catalogue(request))
  const found: string[] = []
  const check = async (name: string) => {
    for (const v of await seriousViolations(page)) found.push(`${name}: ${v}`)
  }
  for (const [name, path] of [
    ["home", "/"],
    ["shop", "/shop"],
    ["product", `/product/${stocked.slug}`],
    ["custom", "/custom"],
  ] as const) {
    await page.goto(home(path))
    await check(name)
  }
  await page.goto(home(`/product/${stocked.slug}`))
  await page.getByRole("button", { name: t(appLocale, "product.add") }).click()
  await page.goto(home("/cart"))
  await check("cart")
  expect(found).toEqual([])
})
