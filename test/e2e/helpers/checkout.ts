import type { Page } from "@playwright/test"
import { E2E } from "../env"
import { type AppLocale, localePath } from "./locale"
import { t } from "./messages"

export const BUYER = {
  customerName: "Test Client",
  email: "client@e2e.local",
  phone: "+21620000000",
  city: "Tunis",
  address: "1 rue de test",
}

/** Puts a piece in the cart and opens the checkout in the given currency. Nothing is filled in. */
export async function openCheckout(
  page: Page,
  options: { locale: AppLocale; slug: string; currency?: "TND" | "EUR" },
): Promise<void> {
  const { locale, slug } = options
  if (options.currency === "EUR") {
    await page.context().addCookies([{ name: "ceraghit_currency", value: "EUR", url: E2E.webUrl }])
  }
  await page.goto(`${E2E.webUrl}${localePath(locale, `/product/${slug}`)}`)
  await page.getByRole("button", { name: t(locale, "product.add") }).click()
  await page.goto(`${E2E.webUrl}${localePath(locale, "/checkout")}`)
  await page.getByLabel(t(locale, "checkout.name")).waitFor()
}

export async function fillCheckout(
  page: Page,
  options: { locale: AppLocale; country: string; method?: "online" | "cod" | "transfer" },
): Promise<void> {
  const { locale } = options
  await page.getByLabel(t(locale, "checkout.name")).fill(BUYER.customerName)
  await page.getByLabel(t(locale, "checkout.email")).fill(BUYER.email)
  await page.getByLabel(t(locale, "checkout.phone")).fill(BUYER.phone)
  await page.getByLabel(t(locale, "checkout.country"), { exact: true }).selectOption(options.country)
  await page.getByLabel(t(locale, "checkout.city")).fill(BUYER.city)
  await page.getByLabel(t(locale, "checkout.address"), { exact: true }).fill(BUYER.address)
  if (options.method) {
    const key = { online: "methodOnline", cod: "methodCod", transfer: "methodTransfer" }[options.method]
    await page.getByRole("radio", { name: t(locale, `checkout.${key}`) }).check()
  }
  await page.getByRole("checkbox").check()
}
