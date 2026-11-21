import { completeCheckout, expect, orderMails, test } from "../../fixtures"
import { catalogue } from "../../helpers/catalogue"
import { t } from "../../helpers/messages"
import { pieceFor } from "../../support/catalogue"
import { orderRow, stockOf } from "../../support/db"

test("02 commande: browse, filter, add to cart, pay cash on delivery", async ({
  page,
  journey,
  request,
  home,
  appLocale,
  isMobile,
}, testInfo) => {
  const piece = await pieceFor(request, testInfo)
  const product = (await catalogue(request)).find((p) => p.slug === piece.slug)
  if (!product) throw new Error("the piece is not in the catalogue")
  const before = await stockOf(piece.id)
  const card = page.getByRole("article").filter({ hasText: product.ref })
  let number = ""

  await journey.step("Ouvrez la boutique", async () => {
    await page.goto(home())
    if (isMobile) await page.getByRole("button", { name: t(appLocale, "nav.menu") }).click()
    await page
      .getByRole("link", { name: t(appLocale, "nav.shop"), exact: true })
      .first()
      .click()
    await expect(page).toHaveURL(home("/shop"))
    expect(await page.getByRole("article").count()).toBeGreaterThan(1)
  })

  await journey.step("Choisissez une collection", async () => {
    const name = product.category.name[appLocale] ?? product.category.name.fr
    await page
      .getByRole("link", { name: new RegExp(`^${name}`) })
      .first()
      .click()
    await expect(page).toHaveURL(home(`/shop/${product.category.slug}`))
    await expect(card).toBeVisible()
  })

  await journey.step("Ouvrez la pièce qui vous plaît", async () => {
    await card.getByRole("link").first().click()
    await expect(page).toHaveURL(home(`/product/${product.slug}`))
  })

  await journey.step("Ajoutez-la au panier", async () => {
    await page.getByRole("button", { name: t(appLocale, "product.add") }).click()
    await expect(page.getByRole("dialog")).toContainText(product.ref)
  })

  await journey.step("Ouvrez le panier et passez commande", async () => {
    await page
      .getByRole("dialog")
      .getByRole("link", { name: t(appLocale, "cart.checkout") })
      .click()
    await expect(page).toHaveURL(home("/checkout"))
  })

  await journey.step("Remplissez vos coordonnées, choisissez le paiement à la livraison et validez", async () => {
    ;({ number } = await completeCheckout(page, { locale: appLocale, method: "cod" }))
    await expect(page.getByRole("status")).toContainText(t(appLocale, "order.codTitle"))
  })

  await journey.step("Votre commande est confirmée et un email vous est envoyé", async () => {
    const order = await orderRow(number)
    expect(order).toMatchObject({ status: "pending_payment", currency: "TND", paymentMethod: "cod" })
    expect(await stockOf(piece.id)).toBe(before - 1)
    const { buyer } = await orderMails(number)
    expect(buyer.text).toContain(number)
  })
})
