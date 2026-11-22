import { E2E } from "../../env"
import { expect, test } from "../../fixtures"
import { catalogue, pickKinds } from "../../helpers/catalogue"
import { APP_LOCALES, localePath } from "../../helpers/locale"

test("pages carry title, description, canonical, hreflang and social tags", { tag: "@desktop" }, async ({
  page,
  request,
  appLocale,
}) => {
  const { stocked } = pickKinds(await catalogue(request))
  const category = stocked.category.slug
  for (const path of ["/", "/shop", `/shop/${category}`, `/product/${stocked.slug}`, "/atelier", "/custom"]) {
    await page.goto(`${E2E.webUrl}${localePath(appLocale, path)}`)
    const meta = (selector: string) => page.locator(selector).first().getAttribute("content")
    expect((await page.title()).length, `${path} title`).toBeGreaterThan(0)
    expect(await meta('meta[name="description"]'), `${path} description`).toBeTruthy()
    expect(await meta('meta[property="og:title"]'), `${path} og:title`).toBeTruthy()
    expect(await meta('meta[name="robots"]'), `${path} robots`).toContain("noindex")
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /^https?:\/\//)
    for (const locale of [...APP_LOCALES, "x-default"]) {
      await expect(page.locator(`link[rel="alternate"][hreflang="${locale}"]`), `${path} ${locale}`).toHaveCount(1)
    }
    const og = await meta('meta[property="og:image"]')
    expect(og, `${path} og:image`).toBeTruthy()
    const res = await page.request.get(new URL(new URL(og ?? "").pathname, E2E.webUrl).toString())
    expect(res.status(), `${path} og image`).toBe(200)
    expect(res.headers()["content-type"]).toContain("image/")
  }
})

test("the product page JSON-LD matches the DB price and stock", { tag: "@desktop" }, async ({
  page,
  request,
  home,
}) => {
  const { stocked } = pickKinds(await catalogue(request))
  await page.goto(home(`/product/${stocked.slug}`))
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents()
  const product = blocks.map((b) => JSON.parse(b)).find((b) => b["@type"] === "Product")
  expect(product).toBeTruthy()
  expect(Number(product.offers.price) * 1000).toBe(stocked.prices.TND)
  expect(product.offers.availability).toContain("InStock")
})

test("home has business JSON-LD and robots disallows everything outside production", { tag: "@desktop" }, async ({
  page,
  home,
}) => {
  await page.goto(home())
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents()
  const org = blocks.map((b) => JSON.parse(b)).find((b) => b["@type"] === "LocalBusiness")
  expect(org).toBeTruthy()
  expect(org.logo).toBeTruthy()
  const logo = typeof org.logo === "string" ? org.logo : org.logo.url
  const logoRes = await page.request.get(new URL(new URL(logo).pathname, E2E.webUrl).toString())
  expect(logoRes.status()).toBe(200)
  const robots = await page.request.get(`${E2E.webUrl}/robots.txt`)
  expect(await robots.text()).toMatch(/^Disallow: \/$/m)
})

test("a trailing slash and a www host redirect permanently to the one canonical url", {
  tag: ["@fr", "@desktop"],
}, async ({ request, step }) => {
  const get = (path: string, headers: Record<string, string> = {}) =>
    request.get(`${E2E.webUrl}${path}`, { maxRedirects: 0, headers })
  await step("/shop/ goes to /shop, in French and with a locale prefix", async () => {
    for (const [from, to] of [
      ["/shop/", "/shop"],
      ["/en/shop/", "/en/shop"],
    ] as const) {
      const res = await get(from)
      expect(res.status(), from).toBe(308)
      expect(new URL(res.headers().location ?? "", E2E.webUrl).pathname, from).toBe(to)
    }
  })
  await step("www.<domain> goes to the apex over https, path kept", async () => {
    const res = await get("/shop?sort=newest", { host: "www.ceraghit.com" })
    expect(res.status()).toBe(308)
    expect(res.headers().location).toBe("https://ceraghit.com/shop?sort=newest")
  })
})
