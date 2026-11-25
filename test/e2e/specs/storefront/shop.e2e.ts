import { expect, test } from "../../fixtures"
import { catalogue, type Product, price } from "../../helpers/catalogue"
import { t } from "../../helpers/messages"

const cards = (page: import("@playwright/test").Page) => page.getByRole("article")

test("search finds one piece by reference and an empty result offers the whole shop", async ({
  page,
  request,
  home,
  appLocale,
  step,
}) => {
  const [first] = await catalogue(request)
  if (!first) throw new Error("empty catalogue")
  await page.goto(home("/shop"))
  await step("search by reference", async () => {
    await page.getByLabel(t(appLocale, "shop.searchLabel")).fill(first.ref)
    await page.getByRole("button", { name: t(appLocale, "shop.search") }).click()
    await expect(page).toHaveURL(/q=/)
    await expect(cards(page)).toHaveCount(1)
    await expect(cards(page)).toContainText(first.ref)
  })
  await step("a term with no match", async () => {
    await page.getByLabel(t(appLocale, "shop.searchLabel")).fill("zzzz-no-such-piece")
    await page.getByRole("button", { name: t(appLocale, "shop.search") }).click()
    await expect(page.getByText(t(appLocale, "shop.empty"))).toBeVisible()
    await expect(cards(page)).toHaveCount(0)
    await page.getByRole("link", { name: t(appLocale, "shop.emptyCta") }).click()
    await expect(page).toHaveURL(home("/shop"))
    expect(await cards(page).count()).toBeGreaterThan(1)
  })
})

test("sorting by price ascending lists the cheapest first, from the TND prices", async ({
  page,
  request,
  home,
  appLocale,
  step,
}) => {
  const all = await catalogue(request)
  await page.goto(home("/shop"))
  await step("sort low to high", async () => {
    await page.getByLabel(t(appLocale, "shop.sortLabel")).selectOption({ label: t(appLocale, "shop.sortPriceAsc") })
    await expect(page).toHaveURL(/sort=price-asc/)
  })
  const sorted = [...all].sort((a, b) => a.prices.TND - b.prices.TND)
  const lowest = sorted[0] as Product
  await expect(cards(page).first()).toContainText(price(lowest.prices.TND, "TND", appLocale))
  const texts = await cards(page).evaluateAll((els) => els.map((el) => el.textContent ?? ""))
  expect(texts.length).toBe(all.length)
  const byRefLength = [...all].sort((a, b) => b.ref.length - a.ref.length)
  const tnd = texts.map((text) => {
    const match = byRefLength.find((p) => text.includes(p.ref))
    if (!match) throw new Error(`no catalogue piece in card: ${text}`)
    return match.prices.TND
  })
  expect(tnd).toEqual([...tnd].sort((a, b) => a - b))
})

test("a category page lists only that category's pieces", async ({ page, request, home, appLocale, step }) => {
  const all = await catalogue(request)
  const categories = [...new Map(all.map((p) => [p.category.slug, p.category])).values()]
  expect(categories.length).toBeGreaterThanOrEqual(2)
  const category = categories[0]
  if (!category) throw new Error("no category")
  await page.goto(home("/shop"))
  await step("open the category", async () => {
    await page
      .getByRole("link", { name: new RegExp(`^${category.name[appLocale] ?? category.name.fr}`) })
      .first()
      .click()
    await expect(page).toHaveURL(home(`/shop/${category.slug}`))
    const expected = all.filter((p) => p.category.slug === category.slug)
    await expect(cards(page)).toHaveCount(expected.length)
  })
})

test("choosing a collection on a phone scrolls to its pieces", async ({ page, request, home }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 640, "phones only")
  const category = (await catalogue(request))[0]?.category
  if (!category) throw new Error("no category")
  await page.goto(home("/shop"))
  // the tile, not the footer link of the same name
  await page.getByRole("main").locator(`a[href$="/shop/${category.slug}"]`).filter({ has: page.locator("img") }).click()
  await expect(page).toHaveURL(home(`/shop/${category.slug}`))
  await expect(page.getByRole("search")).toBeInViewport()
})
