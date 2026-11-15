import { expect, test } from "../../fixtures"
import { catalogue, pickKinds, price } from "../../helpers/catalogue"
import { t, tv } from "../../helpers/messages"
import { forceCurrency } from "../../helpers/storefront"

test("the cart keeps its lines across a reload, sums DB prices per currency and empties", async ({
  page,
  context,
  request,
  home,
  appLocale,
  step,
}) => {
  const { stocked, gallery } = pickKinds(await catalogue(request))
  const second = gallery.slug === stocked.slug ? pickKinds(await catalogue(request)).unique : gallery
  const add = page.getByRole("button", { name: t(appLocale, "product.add") })

  await step("add two pieces", async () => {
    await page.goto(home(`/product/${stocked.slug}`))
    await add.click()
    await page.keyboard.press("Escape")
    await page.goto(home(`/product/${second.slug}`))
    await add.click()
    await expect(page.getByRole("dialog")).toBeVisible()
  })

  const subtotal = (currency: "TND" | "EUR") =>
    price(stocked.prices[currency] + second.prices[currency], currency, appLocale)

  await step("subtotal is the sum of the DB prices", async () => {
    await expect(page.getByRole("dialog").getByText(subtotal("TND"), { exact: true })).toBeVisible()
  })

  await step("raise the first quantity", async () => {
    const line = page.getByRole("dialog").getByRole("listitem").filter({ hasText: stocked.ref })
    await line.getByRole("button", { name: t(appLocale, "product.increase") }).click()
    await expect(line).toContainText("2")
    await expect(
      page
        .getByRole("dialog")
        .getByText(price(stocked.prices.TND * 2 + second.prices.TND, "TND", appLocale), { exact: true }),
    ).toBeVisible()
  })

  await step("lines survive a reload", async () => {
    await page.goto(home("/cart"))
    await page.reload()
    await expect(page.getByRole("listitem").filter({ hasText: stocked.ref })).toBeVisible()
    await expect(page.getByRole("listitem").filter({ hasText: second.ref })).toBeVisible()
  })

  await step("EUR subtotal comes from the EUR prices", async () => {
    await forceCurrency(context, "EUR")
    await page.reload()
    await expect(
      page.getByText(price(stocked.prices.EUR * 2 + second.prices.EUR, "EUR", appLocale), { exact: true }).first(),
    ).toBeVisible()
  })

  await step("remove every line", async () => {
    for (const piece of [stocked, second]) {
      const title = piece.title[appLocale] ?? piece.title.fr
      await page.getByRole("button", { name: tv(appLocale, "cart.remove", { title: title ?? "" }) }).click()
    }
    await expect(page.getByText(t(appLocale, "cart.empty"))).toBeVisible()
  })
})
