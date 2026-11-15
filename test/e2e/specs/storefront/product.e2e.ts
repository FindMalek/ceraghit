import { expect, test } from "../../fixtures"
import { catalogue, pickKinds, price } from "../../helpers/catalogue"
import { t } from "../../helpers/messages"

const slugPath = (slug: string) => `/product/${slug}`

test("choosing a variant adds that variant to the cart with its label", async ({
  page,
  request,
  home,
  appLocale,
  step,
}) => {
  const { variants } = pickKinds(await catalogue(request))
  const target = variants.variants[variants.variants.length - 1]
  if (!target) throw new Error("no variant")
  await page.goto(home(slugPath(variants.slug)))
  await step("choose a variant and add it", async () => {
    await page.locator("label:has(input[name=variant])").last().click()
    await page.getByRole("button", { name: t(appLocale, "product.add") }).click()
    const label = target.label[appLocale] ?? target.label.fr ?? ""
    await expect(page.getByRole("dialog").getByText(label, { exact: true })).toBeVisible()
  })
})

test("the gallery steps through the photos", async ({ page, request, home, appLocale, step }) => {
  const { gallery } = pickKinds(await catalogue(request))
  const total = gallery.images.length
  await page.goto(home(slugPath(gallery.slug)))
  const next = page.getByRole("button", { name: t(appLocale, "product.next") })
  const previous = page.getByRole("button", { name: t(appLocale, "product.previous") })
  const counter = (n: number) =>
    t(appLocale, "product.photo").replace("{n}", String(n)).replace("{total}", String(total))
  await step("next photo", async () => {
    await next.click()
    await expect(page.getByRole("button", { name: counter(2) })).toHaveAttribute("aria-current", "true")
  })
  await step("previous photo", async () => {
    await previous.click()
    await expect(page.getByRole("button", { name: counter(1) })).toHaveAttribute("aria-current", "true")
  })
  const slides = page.locator("[aria-roledescription=carousel] > div img")
  expect(await slides.count()).toBe(total)
  for (const alt of await slides.evaluateAll((imgs) => imgs.map((i) => i.getAttribute("alt") ?? "")))
    expect(alt).not.toBe("")
})

test("a unique piece cannot be added twice and a stocked one stops at its stock", async ({
  page,
  request,
  home,
  appLocale,
  step,
}) => {
  const { unique, stocked } = pickKinds(await catalogue(request))
  await step("unique piece", async () => {
    await page.goto(home(slugPath(unique.slug)))
    await expect(page.getByText(t(appLocale, "product.uniqueNote"))).toBeVisible()
    await expect(page.getByRole("button", { name: t(appLocale, "product.increase") })).toHaveCount(0)
  })
  await step("stocked piece", async () => {
    await page.goto(home(slugPath(stocked.slug)))
    const increase = page.getByRole("button", { name: t(appLocale, "product.increase") })
    const cap = Math.min(stocked.stock, 10)
    for (let i = 1; i < cap; i++) await increase.click()
    await expect(page.locator("output")).toHaveText(String(cap))
    if (stocked.stock <= 10) await expect(increase).toBeDisabled()
  })
})

test("a quote only piece offers a quote and prefills the custom form", async ({ page, request, home, appLocale }) => {
  const { quoteOnly } = pickKinds(await catalogue(request))
  await page.goto(home(slugPath(quoteOnly.slug)))
  await expect(page.getByRole("button", { name: t(appLocale, "product.add") })).toHaveCount(0)
  const cta = page.getByRole("link", { name: t(appLocale, "product.quoteCta") })
  await expect(cta).toHaveAttribute("href", new RegExp(`/custom\\?ref=${quoteOnly.ref}$`))
  await cta.click()
  await expect(page.getByLabel(t(appLocale, "custom.description"))).toHaveValue(new RegExp(quoteOnly.ref))
})

test("the price shown is the DB price of the piece", async ({ page, request, home, appLocale }) => {
  const { stocked } = pickKinds(await catalogue(request))
  await page.goto(home(slugPath(stocked.slug)))
  await expect(page.getByText(price(stocked.prices.TND, "TND", appLocale), { exact: true }).first()).toBeVisible()
})
