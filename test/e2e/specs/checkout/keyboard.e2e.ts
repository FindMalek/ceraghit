import { expect, test } from "../../fixtures"
import { BUYER, openCheckout } from "../../helpers/checkout"
import { t } from "../../helpers/messages"
import { pieceFor } from "../../support/catalogue"

/** Ring or outline: what a keyboard user sees on the focused control. */
async function focusIndicator(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.activeElement as HTMLElement)
    const ring = /\s[1-9]\d*px\s*(,|$)/.test(cs.boxShadow.replace(/rgba?\([^)]*\)/g, ""))
    return ring || (cs.outlineStyle !== "none" && Number.parseFloat(cs.outlineWidth) > 0)
  })
}

test("checkout works with the keyboard alone, focus is always visible", async ({ page, step, appLocale }, testInfo) => {
  const piece = await pieceFor(page.request, testInfo)
  await openCheckout(page, { locale: appLocale, slug: piece.slug })
  await page.getByLabel(t(appLocale, "checkout.name")).focus()

  await step("fill every field by typing and tabbing", async () => {
    for (const value of [BUYER.customerName, BUYER.email, BUYER.phone]) {
      await page.keyboard.type(value)
      await page.keyboard.press("Tab")
      await expect.poll(() => focusIndicator(page), { timeout: 1500 }).toBe(true)
    }
    await expect(page.getByLabel(t(appLocale, "checkout.country"), { exact: true })).toBeFocused()
    await page.keyboard.press("Tab")
    for (const value of [BUYER.city, BUYER.address]) {
      await page.keyboard.type(value)
      await page.keyboard.press("Tab")
      await expect.poll(() => focusIndicator(page), { timeout: 1500 }).toBe(true)
    }
  })

  await step("choose cash on delivery and accept the terms", async () => {
    await page.getByRole("radio", { name: t(appLocale, "checkout.methodOnline") }).focus()
    await page.keyboard.press("ArrowDown")
    await expect(page.getByRole("radio", { name: t(appLocale, "checkout.methodCod") })).toBeChecked()
    await page.getByRole("checkbox").focus()
    await expect.poll(() => focusIndicator(page), { timeout: 1500 }).toBe(true)
    await page.keyboard.press("Space")
    await expect(page.getByRole("checkbox")).toBeChecked()
  })

  await step("submit with Enter", async () => {
    await page.getByRole("button", { name: t(appLocale, "checkout.placeOrder") }).focus()
    await expect.poll(() => focusIndicator(page), { timeout: 1500 }).toBe(true)
    await page.keyboard.press("Enter")
    await expect(page.getByRole("status")).toContainText(t(appLocale, "order.codTitle"))
  })
})

test("every checkout error is announced and tied to its field", async ({ page, step, appLocale }, testInfo) => {
  const piece = await pieceFor(page.request, testInfo)
  await openCheckout(page, { locale: appLocale, slug: piece.slug })

  await step("submit empty", async () => {
    await page.getByRole("radio", { name: t(appLocale, "checkout.methodCod") }).check()
    await page.getByRole("button", { name: t(appLocale, "checkout.placeOrder") }).click()
    for (const [id, key] of [
      ["customerName", "customerName"],
      ["email", "email"],
      ["phone", "phone"],
      ["city", "city"],
      ["address", "address"],
    ] as const) {
      const field = page.locator(`#${id}`)
      await expect(field).toHaveAttribute("aria-invalid", "true")
      const alert = page.locator(`#${id}-error`)
      await expect(alert).toHaveAttribute("role", "alert")
      await expect(alert).toHaveText(t(appLocale, `checkout.errors.${key}`))
      await expect(field).toHaveAttribute("aria-describedby", new RegExp(`${id}-error`))
    }
    const terms = page.getByRole("checkbox")
    await expect(terms).toHaveAttribute("aria-invalid", "true")
    await expect(page.locator("#terms-error")).toHaveAttribute("role", "alert")
    await expect(terms).toHaveAttribute("aria-describedby", "terms-error")
  })
})
