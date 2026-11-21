import { E2E } from "../../env"
import { expect, test } from "../../fixtures"
import { type AppLocale, localePath } from "../../helpers/locale"
import { t } from "../../helpers/messages"
import { createOrderViaApi } from "../../helpers/order"
import { layoutProblems } from "../../support/layout"

/** Runs in all six storefront projects: fr, en, ar on desktop and on a phone. */
const LEGAL_DOCS = ["terms", "shipping", "notice", "privacy"]

interface ApiProduct {
  slug: string
  title: Record<string, string | undefined>
  variants: unknown[]
  unique: boolean
  quoteOnly: boolean
}

async function products(request: import("@playwright/test").APIRequestContext): Promise<ApiProduct[]> {
  return (await (await request.get(`${E2E.apiUrl}/v1/products`)).json()) as ApiProduct[]
}

const longest = (list: ApiProduct[], locale: AppLocale): ApiProduct =>
  [...list].sort(
    (a, b) => (b.title[locale] ?? b.title.fr ?? "").length - (a.title[locale] ?? a.title.fr ?? "").length,
  )[0]!

test("storefront pages fit the screen in this language and on this device", async ({
  page,
  request,
  appLocale,
  isMobile,
  step,
}) => {
  const list = await products(request)
  const withVariants = list.find((p) => p.variants.length > 0)
  const open = async (path: string) => {
    await page.goto(`${E2E.webUrl}${localePath(appLocale, path)}`)
    await page.waitForLoadState("networkidle")
  }
  const check = async (name: string, path: string, prepare?: () => Promise<void>) => {
    await step(name, async () => {
      await open(path)
      await prepare?.()
      expect(await layoutProblems(page), `${path} in ${appLocale}`).toEqual([])
      if (appLocale === "ar") {
        await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
        const logo = await page.getByRole("banner").getByRole("link").first().boundingBox()
        const width = page.viewportSize()?.width ?? 0
        expect(logo ? logo.x + logo.width / 2 : 0, "the logo sits on the right in RTL").toBeGreaterThan(width / 2)
      }
    })
  }

  await check("home", "/")
  await check("shop", "/shop")
  await check("a category", "/shop/curda-seca")
  await check("the piece with the longest title", `/product/${longest(list, appLocale).slug}`)
  if (withVariants) await check("a piece with variants", `/product/${withVariants.slug}`)
  await check("custom request, empty", "/custom")
  await check("custom request, with errors", "/custom", async () => {
    await page.getByRole("button", { name: t(appLocale, "custom.submit") }).click()
  })
  await check("atelier", "/atelier")
  for (const doc of LEGAL_DOCS) await check(`legal ${doc}`, `/legal/${doc}`)
  await check("not found", "/no-such-page")

  await step("the cart with three lines", async () => {
    const plain = list.filter((p) => !p.unique && !p.quoteOnly && p.variants.length === 0)
    const three = [...plain]
      .sort((a, b) => (b.title[appLocale] ?? "").length - (a.title[appLocale] ?? "").length)
      .slice(0, 3)
    for (const piece of three) {
      await open(`/product/${piece.slug}`)
      await page.getByRole("button", { name: t(appLocale, "product.add") }).click()
    }
    await open("/cart")
    expect(await layoutProblems(page), `cart in ${appLocale}`).toEqual([])
  })

  await step("the checkout with errors shown", async () => {
    await open("/checkout")
    await page
      .getByRole("button", {
        name: new RegExp(`^${t(appLocale, "checkout.placeOrder")}|^${t(appLocale, "checkout.pay").split("{")[0]}`),
      })
      .click()
    expect(await layoutProblems(page), `checkout in ${appLocale}`).toEqual([])
  })

  await step("a transfer order page with the bank details", async () => {
    const order = await createOrderViaApi(request, { method: "transfer", country: "FR", locale: appLocale })
    await page.goto(`${E2E.webUrl}${localePath(appLocale, `/order/${order.number}`)}?token=${order.token}`)
    await page.waitForLoadState("networkidle")
    expect(await layoutProblems(page), `order page in ${appLocale}`).toEqual([])
  })

  expect(isMobile ? "mobile" : "desktop").toBeTruthy()
})

test("the detector sees a box that sticks out and text cut by its box", { tag: ["@fr", "@desktop"] }, async ({
  page,
  step,
}) => {
  await step("a page with a 2000px box and a clipped label is reported", async () => {
    await page.setContent(
      `<body><div style="width:2000px;height:20px;background:#ccc">wide</div><p style="width:40px;overflow:hidden;white-space:nowrap">a label that is too long</p></body>`,
    )
    const kinds = (await layoutProblems(page)).map((problem) => problem.kind)
    expect(kinds).toEqual(expect.arrayContaining(["overflow", "outside", "clipped"]))
  })
})
