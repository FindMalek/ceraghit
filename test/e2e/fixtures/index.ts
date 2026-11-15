import { test as base, expect, type Page } from "@playwright/test"
import { E2E } from "../env"
import { type AppLocale, localePath } from "../helpers/locale"
import { shot, step } from "../helpers/screenshot"

export { APP_LOCALES } from "../helpers/locale"
export type { AppLocale }

/** Test options set per project in `playwright.config.ts`. */
export interface E2EOptions {
  appLocale: AppLocale
}

interface E2EFixtures {
  /** A page signed in on the dashboard, with the same device as the project. */
  ownerPage: Page
  /** Storefront path in the project locale: `home("/shop")` -> `/en/shop`. */
  home: (path?: string) => string
  /** Runs a user-visible step and screenshots it. Pass another page (e.g. `ownerPage`) to shoot that one. */
  step: (title: string, fn: () => Promise<void>, target?: Page) => Promise<void>
  shot: (name: string, target?: Page) => Promise<void>
}

export const test = base.extend<E2EOptions & E2EFixtures>({
  appLocale: ["fr", { option: true }],

  home: async ({ appLocale }, use) => {
    await use((path = "/") => `${E2E.webUrl}${localePath(appLocale, path)}`)
  },

  step: async ({ page }, use, testInfo) => {
    await use((title, fn, target) => step(target ?? page, testInfo, title, fn))
  },

  shot: async ({ page }, use, testInfo) => {
    await use(async (name, target) => {
      await shot(target ?? page, testInfo, name)
    })
  },

  ownerPage: async ({ browser, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent, locale }, use) => {
    const context = await browser.newContext({
      storageState: E2E.ownerState,
      viewport,
      isMobile,
      hasTouch,
      deviceScaleFactor,
      userAgent,
      locale,
    })
    await use(await context.newPage())
    await context.close()
  },
})

export { payDemo } from "../helpers/demo-gateway"
export { loginAsOwner } from "../helpers/login"
export { createOrderViaApi, placeOrder } from "../helpers/order"
export { clearMails, latestMailTo, mailWithSubject } from "../support/mailpit"
export { expect }
