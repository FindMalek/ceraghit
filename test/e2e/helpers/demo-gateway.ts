import type { Page } from "@playwright/test"
import type { AppLocale } from "./locale"
import { t } from "./messages"

/** On `/checkout/demo`: pick the outcome, then wait for the order page the gateway redirects to. */
export async function payDemo(page: Page, locale: AppLocale, outcome: "success" | "fail"): Promise<void> {
  await page.waitForURL(/\/checkout\/demo\?/)
  await page.getByRole("button", { name: t(locale, outcome === "success" ? "demo.pay" : "demo.fail") }).click()
  await page.waitForURL(/\/order\/[^/?]+\?t=/)
}
