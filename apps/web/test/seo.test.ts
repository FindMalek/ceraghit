import { beforeAll, describe, expect, mock, test } from "bun:test"

process.env.APP_ENV = "production"
process.env.WEB_URL = "https://ceraghit.com"

mock.module("@/lib/api", () => ({
  getCategories: async () => [{ slug: "lampes", name: { fr: "Lampes" } }],
  getProducts: async () => [{ slug: "lampe-votive-0200", title: { fr: "Lampe" } }],
}))

let seo: typeof import("../lib/seo")
let robots: typeof import("../app/robots")
let sitemap: typeof import("../app/sitemap")

beforeAll(async () => {
  seo = await import("../lib/seo")
  robots = await import("../app/robots")
  sitemap = await import("../app/sitemap")
})

describe("localizedPath", () => {
  test("French stays at the root, every other locale is prefixed", () => {
    expect(seo.localizedPath("fr", "/shop")).toBe("/shop")
    expect(seo.localizedPath("en", "/shop")).toBe("/en/shop")
    expect(seo.localizedPath("ar", "/shop")).toBe("/ar/shop")
  })

  test("the home page is a slash", () => {
    expect(seo.localizedPath("fr", "")).toBe("/")
    expect(seo.localizedPath("en", "")).toBe("/en")
  })
})

describe("pageMetadata", () => {
  test("sets a canonical and an alternate for every enabled locale", () => {
    const meta = seo.pageMetadata({ locale: "en", path: "/shop", title: "Boutique" })
    expect(meta.alternates?.canonical).toBe("https://ceraghit.com/en/shop")
    expect(meta.alternates?.languages).toEqual({
      fr: "https://ceraghit.com/shop",
      en: "https://ceraghit.com/en/shop",
      ar: "https://ceraghit.com/ar/shop",
      "x-default": "https://ceraghit.com/shop",
    })
  })

  test("the product path keeps the locale prefix in alternates", () => {
    const meta = seo.pageMetadata({ locale: "ar", path: "/product/lampe-votive-0200" })
    expect(meta.alternates?.canonical).toBe("https://ceraghit.com/ar/product/lampe-votive-0200")
    const languages = meta.alternates?.languages as Record<string, string> | undefined
    expect(languages?.fr).toBe("https://ceraghit.com/product/lampe-votive-0200")
  })
})

describe("robots", () => {
  test("production allows the shop and keeps the private areas out", () => {
    const file = robots.default()
    expect(file.rules).toMatchObject({ userAgent: "*", allow: "/" })
    expect(file.rules).toMatchObject({
      disallow: ["/api/", "/checkout", "/order/", "/*/checkout", "/*/order/", "/*/cart"],
    })
    expect(file.sitemap).toBe("https://ceraghit.com/sitemap.xml")
  })
})

describe("sitemap", () => {
  test("every entry has an alternate for all three locales", async () => {
    const entries = await sitemap.default()
    expect(entries.length).toBeGreaterThan(3)
    for (const entry of entries) {
      expect(entry.url.startsWith("https://ceraghit.com")).toBe(true)
      expect(Object.keys(entry.alternates?.languages ?? {}).sort()).toEqual(["ar", "en", "fr"])
    }
    expect(entries.some((e) => e.url === "https://ceraghit.com/en/shop")).toBe(false)
    expect(entries.find((e) => e.url === "https://ceraghit.com/shop")?.alternates?.languages).toMatchObject({
      en: "https://ceraghit.com/en/shop",
      ar: "https://ceraghit.com/ar/shop",
    })
  })

  test("the product and category pages are listed", async () => {
    const urls = (await sitemap.default()).map((e) => e.url)
    expect(urls).toContain("https://ceraghit.com/shop/lampes")
    expect(urls).toContain("https://ceraghit.com/product/lampe-votive-0200")
  })
})
