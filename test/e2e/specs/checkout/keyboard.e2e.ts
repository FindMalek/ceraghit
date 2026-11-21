import type { Locator, Page } from "@playwright/test"
import { expect, test } from "../../fixtures"
import { BUYER, openCheckout } from "../../helpers/checkout"
import type { AppLocale } from "../../helpers/locale"
import { t } from "../../helpers/messages"
import { pieceFor } from "../../support/catalogue"

/** A visible ring or outline on the focused control: real colour (not transparent) and real width or spread. */
async function hasFocusIndicator(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.activeElement as HTMLElement)
    const COLOR = /[a-z-]+\((?:[^()]|\([^()]*\))*\)/
    const opaque = (color: string) => {
      if (!COLOR.test(color)) return false
      const slash = color.match(/\/\s*([\d.]+)(%?)\s*\)$/)
      if (slash) return Number.parseFloat(slash[1] ?? "1") > 0
      const legacy = color.match(/^rgba\(([^)]+)\)$/)
      return legacy ? Number.parseFloat((legacy[1] ?? "").split(",")[3] ?? "1") > 0 : true
    }
    const topLevel = (list: string): string[] => {
      const out: string[] = []
      let depth = 0
      let start = 0
      for (let i = 0; i < list.length; i++) {
        if (list[i] === "(") depth++
        if (list[i] === ")") depth--
        if (list[i] === "," && depth === 0) {
          out.push(list.slice(start, i))
          start = i + 1
        }
      }
      out.push(list.slice(start))
      return out
    }
    const outline = cs.outlineStyle !== "none" && Number.parseFloat(cs.outlineWidth) > 0 && opaque(cs.outlineColor)
    const ring =
      cs.boxShadow !== "none" &&
      topLevel(cs.boxShadow).some((shadow) => {
        const color = shadow.match(COLOR)?.[0] ?? ""
        const lengths = (shadow.replace(color, "").match(/-?\d+(\.\d+)?px/g) ?? []).map(Number.parseFloat)
        return opaque(color) && (lengths[3] ?? 0) > 0
      })
    return outline || ring
  })
}

async function expectIndicator(page: Page): Promise<void> {
  await expect.poll(() => hasFocusIndicator(page), { timeout: 1500 }).toBe(true)
}

/** Focus is on `target` and shows a ring: checked before the keyboard leaves the control. */
async function expectFocusedWithIndicator(page: Page, target: Locator): Promise<void> {
  await expect(target).toBeFocused({ timeout: 1500 })
  await expectIndicator(page)
}

async function tabTo(page: Page, target: Locator): Promise<void> {
  await page.keyboard.press("Tab")
  await expectFocusedWithIndicator(page, target)
}

function fieldFor(page: Page, locale: AppLocale, key: string, exact = false): Locator {
  return page.getByLabel(t(locale, `checkout.${key}`), { exact })
}

test("checkout works with the keyboard alone, focus is always visible", async ({ page, step, appLocale }, testInfo) => {
  const piece = await pieceFor(page.request, testInfo)
  await openCheckout(page, { locale: appLocale, slug: piece.slug })
  const field = (key: string, exact = false) => fieldFor(page, appLocale, key, exact)

  await step("fill every field by typing and tabbing", async () => {
    const name = field("name")
    await name.fill(BUYER.customerName)
    await expect(name).toHaveValue(BUYER.customerName)
    await expectFocusedWithIndicator(page, name)

    await tabTo(page, field("email"))
    await page.keyboard.type(BUYER.email)
    await tabTo(page, field("phone"))
    await page.keyboard.type(BUYER.phone)
    await tabTo(page, field("country", true))
    await tabTo(page, field("city"))
    await page.keyboard.type(BUYER.city)
    await tabTo(page, field("address", true))
    await page.keyboard.type(BUYER.address)
    await tabTo(page, page.locator("#postalCode"))
    await tabTo(page, page.locator("#note"))
  })

  await step("choose cash on delivery and accept the terms", async () => {
    const online = page.getByRole("radio", { name: t(appLocale, "checkout.methodOnline") })
    const cod = page.getByRole("radio", { name: t(appLocale, "checkout.methodCod") })
    await tabTo(page, online)
    await page.keyboard.press("ArrowDown")
    await expect(cod).toBeChecked()
    await expectFocusedWithIndicator(page, cod)

    const terms = page.getByRole("checkbox")
    await tabTo(page, terms)
    await page.keyboard.press("Space")
    await expect(terms).toBeChecked()
  })

  await step("submit with Enter", async () => {
    await page.keyboard.press("Tab")
    await page.keyboard.press("Tab")
    await tabTo(page, page.getByRole("button", { name: t(appLocale, "checkout.placeOrder") }))
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
    const tied = async (control: Locator, errorId: string) => {
      const ids = ((await control.getAttribute("aria-describedby")) ?? "").split(/\s+/)
      expect(ids).toContain(errorId)
    }
    for (const id of ["customerName", "email", "phone", "city", "address"]) {
      const control = page.locator(`#${id}`)
      await expect(control).toHaveAttribute("aria-invalid", "true")
      const alert = page.locator(`#${id}-error`)
      await expect(alert).toHaveAttribute("role", "alert")
      await expect(alert).toHaveText(t(appLocale, `checkout.errors.${id}`))
      await tied(control, `${id}-error`)
    }
    const terms = page.getByRole("checkbox")
    await expect(terms).toHaveAttribute("aria-invalid", "true")
    const alert = page.locator("#terms-error")
    await expect(alert).toHaveAttribute("role", "alert")
    await expect(alert).toHaveText(t(appLocale, "checkout.errors.terms"))
    await tied(terms, "terms-error")
  })
})
