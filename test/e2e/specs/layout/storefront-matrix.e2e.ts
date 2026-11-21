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

type Ctx = { list: ApiProduct[]; locale: AppLocale }
type Page = import("@playwright/test").Page
type Api = import("@playwright/test").APIRequestContext
type Prepare = (page: Page, ctx: Ctx, request: Api) => Promise<string>

const plainPieces = (list: ApiProduct[], locale: AppLocale) =>
  list
    .filter((p) => !p.unique && !p.quoteOnly && p.variants.length === 0)
    .sort((a, b) => (b.title[locale] ?? "").length - (a.title[locale] ?? "").length)

/** One test per page: a slow page only spends its own budget. Each prepares the page and returns its path. */
const CASES: { name: string; prepare: Prepare }[] = [
  { name: "home", prepare: async () => "/" },
  { name: "shop", prepare: async () => "/shop" },
  { name: "a category", prepare: async () => "/shop/curda-seca" },
  {
    name: "the piece with the longest title",
    prepare: async (_p, { list, locale }) => `/product/${longest(list, locale).slug}`,
  },
  {
    name: "a piece with variants",
    prepare: async (_p, { list }) => `/product/${list.find((p) => p.variants.length > 0)?.slug ?? list[0]!.slug}`,
  },
  { name: "custom request, empty", prepare: async () => "/custom" },
  {
    name: "custom request, with errors",
    prepare: async (page, { locale }) => {
      await page.goto(`${E2E.webUrl}${localePath(locale, "/custom")}`)
      await page.getByRole("button", { name: t(locale, "custom.submit") }).click()
      return "/custom"
    },
  },
  { name: "atelier", prepare: async () => "/atelier" },
  ...LEGAL_DOCS.map((doc) => ({ name: `legal ${doc}`, prepare: async () => `/legal/${doc}` })),
  { name: "not found", prepare: async () => "/no-such-page" },
  {
    name: "the cart with three lines",
    prepare: async (page, { list, locale }) => {
      for (const piece of plainPieces(list, locale).slice(0, 3)) {
        await page.goto(`${E2E.webUrl}${localePath(locale, `/product/${piece.slug}`)}`)
        await page.getByRole("button", { name: t(locale, "product.add") }).click()
      }
      await page.goto(`${E2E.webUrl}${localePath(locale, "/cart")}`)
      return "/cart"
    },
  },
  {
    name: "the checkout with errors shown",
    prepare: async (page, { list, locale }) => {
      await page.goto(`${E2E.webUrl}${localePath(locale, `/product/${plainPieces(list, locale)[0]!.slug}`)}`)
      await page.getByRole("button", { name: t(locale, "product.add") }).click()
      await page.goto(`${E2E.webUrl}${localePath(locale, "/checkout")}`)
      await page
        .getByRole("button", {
          name: new RegExp(`^${t(locale, "checkout.placeOrder")}|^${t(locale, "checkout.pay").split("{")[0]}`),
        })
        .click()
      return "/checkout"
    },
  },
  {
    name: "a transfer order page with the bank details",
    prepare: async (page, { locale }, request) => {
      const order = await createOrderViaApi(request, { method: "transfer", country: "FR", locale })
      await page.goto(`${E2E.webUrl}${localePath(locale, `/order/${order.number}`)}?t=${order.token}`)
      await expect(page.locator("dt", { hasText: t(locale, "order.iban") })).toBeVisible()
      return `/order/${order.number}`
    },
  },
]

for (const { name, prepare } of CASES) {
  test(`storefront fits the screen: ${name}`, async ({ page, request, appLocale, step }) => {
    test.setTimeout(90_000)
    await step(name, async () => {
      const list = await products(request)
      const path = await prepare(page, { list, locale: appLocale }, request)
      // Pages that were opened by prepare (forms, cart) are already on screen; plain ones are opened here.
      if (page.url() === "about:blank") await page.goto(`${E2E.webUrl}${localePath(appLocale, path)}`)
      await page.waitForLoadState("networkidle")
      expect(await layoutProblems(page), `${path} in ${appLocale}`).toEqual([])
      if (appLocale === "ar") {
        await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
        const logo = await page.getByRole("banner").getByRole("link").first().boundingBox()
        const width = page.viewportSize()?.width ?? 0
        expect(logo ? logo.x + logo.width / 2 : 0, "the logo sits on the right in RTL").toBeGreaterThan(width / 2)
      }
    })
  })
}

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
