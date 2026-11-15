import { E2E } from "../../env"
import { expect, test } from "../../fixtures"
import { catalogue, pickKinds, price } from "../../helpers/catalogue"
import { localePath } from "../../helpers/locale"
import { t } from "../../helpers/messages"
import { forceCurrency } from "../../helpers/storefront"

test("the header reaches every page and the logo comes back home", async ({
  page,
  home,
  step,
  appLocale,
  isMobile,
}) => {
  const open = async (label: string) => {
    if (isMobile) await page.getByRole("button", { name: t(appLocale, "nav.menu") }).click()
    await page.getByRole("link", { name: label, exact: true }).first().click()
  }
  await page.goto(home())
  for (const [key, path] of [
    ["nav.shop", "/shop"],
    ["nav.atelier", "/atelier"],
    ["nav.custom", "/custom"],
  ] as const) {
    await step(`open ${key}`, async () => {
      await open(t(appLocale, key))
      await expect(page).toHaveURL(`${home(path)}`)
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    })
  }
  await step("the logo goes home", async () => {
    await page.getByRole("banner").getByRole("link").first().click()
    await expect(page).toHaveURL(home())
  })
})

test("the skip link focuses the main content", { tag: "@desktop" }, async ({ page, home, appLocale }) => {
  await page.goto(home())
  await page.keyboard.press("Tab")
  const skip = page.getByRole("link", { name: t(appLocale, "nav.skip") })
  await expect(skip).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(/#content$/)
  await expect(page.locator("main#content")).toBeFocused()
})

test("switching language keeps the page and flips direction", { tag: "@fr" }, async ({ page, step }) => {
  const labels = { fr: "Français", en: "English", ar: "العربية" } as const
  await page.goto(`${E2E.webUrl}/shop`)
  for (const locale of ["en", "ar", "fr"] as const) {
    await step(`switch to ${locale}`, async () => {
      await page.getByRole("link", { name: labels[locale], exact: true }).first().click()
      await expect(page).toHaveURL(`${E2E.webUrl}${localePath(locale, "/shop")}`)
      await expect(page.locator("html")).toHaveAttribute("lang", locale)
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr")
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(locale, "shop.title"))
    })
  }
})

test("the cookie currency shows that currency's own price, never a conversion", async ({
  page,
  context,
  request,
  home,
  appLocale,
}) => {
  const { stocked } = pickKinds(await catalogue(request))
  await forceCurrency(context, "EUR")
  await page.goto(home(`/product/${stocked.slug}`))
  const eur = price(stocked.prices.EUR, "EUR", appLocale)
  await expect(page.getByText(eur, { exact: true }).first()).toBeVisible()
  await expect(page.getByText(price(stocked.prices.TND, "TND", appLocale), { exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByText(eur, { exact: true }).first()).toBeVisible()
})

test("an unknown page is a 404 and every legal document renders", async ({ page, home, appLocale, step }) => {
  await step("404", async () => {
    const res = await page.goto(home("/does-not-exist"))
    expect(res?.status()).toBe(404)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(appLocale, "notFound.title"))
  })
  for (const doc of ["terms", "shipping", "notice", "privacy"]) {
    await step(`legal ${doc}`, async () => {
      const res = await page.goto(home(`/legal/${doc}`))
      expect(res?.status()).toBe(200)
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(appLocale, `legal.docs.${doc}.title`))
      expect(await page.getByRole("heading", { level: 2 }).count()).toBeGreaterThan(0)
    })
  }
})

test("hero stays on its first photo with reduced motion", async ({ page, home }) => {
  await page.clock.install()
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(home())
  const slides = page.locator("main img.object-cover.transition-opacity")
  await expect(slides.first()).toHaveClass(/opacity-100/)
  await page.clock.runFor(20_000)
  await expect(slides.first()).toHaveClass(/opacity-100/)
})

test("hero rotates to the next photo after five seconds", async ({ page, home }) => {
  // Frozen before load: a slow page must not burn the five seconds before the carousel starts its timer.
  await page.clock.install({ time: 0 })
  await page.clock.pauseAt(1000)
  await page.goto(home())
  const slides = page.locator("main img.object-cover.transition-opacity")
  expect(await slides.count()).toBeGreaterThan(1)
  await expect(slides.first()).toHaveClass(/opacity-100/)
  await expect
    .poll(() => slides.first().evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps"))))
    .toBe(true)
  // React runs the carousel effect (which starts the timer) from a MessageChannel task, so wait for one round trip.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const { port1, port2 } = new MessageChannel()
        port1.onmessage = () => resolve()
        port2.postMessage(null)
      }),
  )
  await page.clock.runFor(5000)
  await expect(slides.nth(1)).toHaveClass(/opacity-100/)
  await expect(slides.first()).toHaveClass(/opacity-0/)
})
