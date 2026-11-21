import { test as base, expect, type Page } from "@playwright/test"
import { E2E } from "../env"
import { attachTimings, createJourney, type Journey } from "../helpers/journey"
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
  /** Tutorial video steps: French captions, pacing only when `JOURNEY_RECORD=1`. */
  journey: Journey
}

export const test = base.extend<E2EOptions & E2EFixtures>({
  appLocale: ["fr", { option: true }],

  /** Every test is its own client for the api rate limits (10 orders per 10 minutes per ip), as real buyers are. */
  page: async ({ page }, use, testInfo) => {
    let hash = 0
    for (const ch of `${testInfo.testId}:${testInfo.retry}`) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
    await page
      .context()
      .setExtraHTTPHeaders({ "x-forwarded-for": `10.${(hash >> 16) & 255}.${(hash >> 8) & 255}.${hash & 255}` })
    await use(page)
  },

  home: async ({ appLocale }, use) => {
    await use((path = "/") => `${E2E.webUrl}${localePath(appLocale, path)}`)
  },

  step: async ({ page }, use, testInfo) => {
    await use((title, fn, target) => step(target ?? page, testInfo, title, fn))
  },

  journey: async ({ page }, use, testInfo) => {
    const journey = createJourney(page, testInfo)
    await use(journey)
    await attachTimings(journey, testInfo)
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
export { loginAsOwner, loginAsOwnerAndWait } from "../helpers/login"
export { completeCheckout, createOrderViaApi, placeOrder } from "../helpers/order"
export { clearMails, latestMailTo, mailWithSubject, orderMails } from "../support/mailpit"
export { expect }
