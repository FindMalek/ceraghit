import type { BrowserContextOptions, Page } from "@playwright/test"
import { E2E } from "../../env"
import { expect, test } from "../../fixtures"
import { t } from "../../helpers/messages"
import { BUDGETS, CPU_SLOWDOWN, FAST_3G } from "../../perf-budgets"

/** Chromium only (CDP throttling), once per device: the locale does not change what is measured, except fonts. */
const ONCE = { tag: ["@fr"] }

interface Vitals {
  lcp: number
  lcpUrl: string | null
  cls: number
}

interface Img {
  url: string
  type: string
  bytes: number
}

/** Collects LCP and layout shifts in the page, the way the web-vitals library does. */
const OBSERVE = () => {
  const w = window as unknown as { __vitals: { lcp: number; lcpUrl: string | null; cls: number } }
  w.__vitals = { lcp: 0, lcpUrl: null, cls: 0 }
  new PerformanceObserver((list) => {
    const last = list.getEntries().at(-1) as (PerformanceEntry & { url?: string; startTime: number }) | undefined
    if (last) {
      w.__vitals.lcp = last.startTime
      w.__vitals.lcpUrl = last.url || null
    }
  }).observe({ type: "largest-contentful-paint", buffered: true })
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[])
      if (!entry.hadRecentInput) w.__vitals.cls += entry.value
  }).observe({ type: "layout-shift", buffered: true })
}

async function throttle(page: Page, mobile: boolean): Promise<void> {
  if (!mobile) return
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Network.enable")
  await cdp.send("Network.emulateNetworkConditions", { offline: false, ...FAST_3G })
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN })
}

/** Image responses of the page, with their real transferred size. */
function recordImages(page: Page): Img[] {
  const images: Img[] = []
  page.on("response", async (res) => {
    const type = res.headers()["content-type"] ?? ""
    if (!type.startsWith("image/") || res.status() >= 400) return
    const body = await res.body().catch(() => null)
    if (body) images.push({ url: res.url(), type, bytes: body.length })
  })
  return images
}

async function vitals(page: Page): Promise<Vitals> {
  // LCP settles once the page is idle and the user (here: the script) interacts or the page hides.
  await page.waitForLoadState("networkidle")
  await page.mouse.click(1, 1)
  return page.evaluate(() => (window as unknown as { __vitals: Vitals }).__vitals)
}

const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0

async function firstProductSlug(page: Page): Promise<string> {
  const list = (await (await page.request.get(`${E2E.apiUrl}/v1/products`)).json()) as {
    slug: string
    images: unknown[]
  }[]
  const withPhotos = list.find((p) => p.images.length >= 2)
  if (!withPhotos) throw new Error("no product with several photos in the demo seed")
  return withPhotos.slug
}

test(
  "home: LCP and CLS stay inside the budget and the hero image is light",
  ONCE,
  async ({ browser, isMobile, step }, testInfo) => {
    const device = isMobile ? "mobile" : "desktop"
    const runs: Vitals[] = []
    let images: Img[] = []
    let page: Page | undefined
    for (let run = 0; run < 3; run++) {
      const context = await browser.newContext(testInfo.project.use as BrowserContextOptions)
      page = await context.newPage()
      await page.addInitScript(OBSERVE)
      await throttle(page, isMobile)
      images = recordImages(page)
      await page.goto(E2E.webUrl)
      runs.push(await vitals(page))
      if (run < 2) await context.close()
    }
    if (!page) throw new Error("no page")

    await step(
      `the home page loads fast on ${device}`,
      async () => {
        const lcp = median(runs.map((r) => r.lcp))
        testInfo.annotations.push({ type: "lcp", description: `${Math.round(lcp)} ms, element ${runs[0]?.lcpUrl}` })
        expect(lcp, "median LCP").toBeLessThanOrEqual(BUDGETS.lcpMs[device])
        expect(median(runs.map((r) => r.cls)), "median CLS").toBeLessThanOrEqual(BUDGETS.cls)
      },
      page,
    )

    await step(
      "the images of the first viewport are WebP and light",
      async () => {
        const hero = images.find((img) => runs[0]?.lcpUrl && img.url === runs[0].lcpUrl)
        if (hero) expect(hero.bytes, `hero ${hero.url}`).toBeLessThanOrEqual(BUDGETS.heroBytes[device])
        for (const img of images) {
          expect(img.type, img.url).toMatch(/image\/(webp|avif|svg\+xml|png|x-icon|vnd\.microsoft\.icon)/)
          expect(img.bytes, img.url).toBeLessThanOrEqual(BUDGETS.imageBytes)
        }
        const total = images.reduce((sum, img) => sum + img.bytes, 0)
        expect(total, "image bytes on load").toBeLessThanOrEqual(BUDGETS.homeImagesBytes)
      },
      page,
    )

    await step(
      "the LCP image is not lazy and every optimised image reserves its space",
      async () => {
        // Plain <img> (the logo) have a fixed CSS size, the CLS budget above covers them; next/image must carry its size.
        const report = await page!.evaluate(() =>
          [...document.images].map((img) => ({
            src: img.currentSrc || img.src,
            lazy: img.loading === "lazy",
            optimised: img.hasAttribute("data-nimg"),
            sized: img.hasAttribute("width") && img.hasAttribute("height"),
            fill: img.getAttribute("data-nimg") === "fill",
          })),
        )
        const unsized = report.filter((img) => img.optimised && !img.fill && !img.sized).map((img) => img.src)
        expect(unsized, "next/image without width and height").toEqual([])
        const lcpUrl = runs[0]?.lcpUrl
        if (lcpUrl) expect(report.find((img) => img.src === lcpUrl)?.lazy, "LCP image is lazy").toBe(false)
      },
      page,
    )
  },
)

test("shop: the grid only loads the first viewport and a few more", ONCE, async ({ page, isMobile, step }) => {
  test.fixme(isMobile, "#350 the shop loads the category tiles and the cards eagerly on a phone")
  await step("the shop grid opens", async () => {
    await page.goto(`${E2E.webUrl}/shop`)
    await page.waitForLoadState("networkidle")
  })
  await step("images below the fold are lazy", async () => {
    const { inViewport, eager, total, eagerSrc } = await page.evaluate(() => {
      const all = [...document.images]
      return {
        total: all.length,
        inViewport: all.filter((img) => img.getBoundingClientRect().top < window.innerHeight).length,
        eager: all.filter((img) => img.loading !== "lazy").length,
        eagerSrc: all.filter((img) => img.loading !== "lazy").map((img) => img.currentSrc || img.src),
      }
    })
    expect(total, "the demo catalogue fills more than one screen").toBeGreaterThan(inViewport + BUDGETS.shopLookAhead)
    expect(eager, `eager images: ${eagerSrc.join(" ")}`).toBeLessThanOrEqual(inViewport + BUDGETS.shopLookAhead)
  })
})

test("product: the gallery does not shift the layout and photos stay light", ONCE, async ({ page, isMobile, step }) => {
  test.fixme(isMobile, "#351 the product page LCP is 6.2 s on throttled mobile")
  await page.addInitScript(OBSERVE)
  await throttle(page, isMobile)
  const images = recordImages(page)
  const slug = await firstProductSlug(page)

  await step("the product page loads inside the budget", async () => {
    await page.goto(`${E2E.webUrl}/product/${slug}`)
    const result = await vitals(page)
    expect(result.lcp, `LCP element ${result.lcpUrl}`).toBeLessThanOrEqual(
      BUDGETS.lcpMs[isMobile ? "mobile" : "desktop"],
    )
    expect(result.cls, "CLS").toBeLessThanOrEqual(BUDGETS.cls)
    for (const img of images) expect(img.bytes, img.url).toBeLessThanOrEqual(BUDGETS.imageBytes)
  })

  await step("switching photos three times moves nothing", async () => {
    const before = await page.evaluate(() => (window as unknown as { __vitals: Vitals }).__vitals.cls)
    const label = t("fr", "product.photo").replace("{n}", "\\d+").replace("{total}", "\\d+")
    const thumbs = page.getByRole("button", { name: new RegExp(`^${label}$`) })
    const count = Math.min(await thumbs.count(), 3)
    expect(count, "the product has a gallery to switch").toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      await thumbs.nth(i).click()
      await page.waitForLoadState("networkidle")
    }
    const after = await page.evaluate(() => (window as unknown as { __vitals: Vitals }).__vitals.cls)
    expect(after - before, "CLS added by the gallery").toBeLessThanOrEqual(BUDGETS.cls)
  })
})

test("mobile asks for smaller images than desktop", { tag: ["@fr", "@desktop"] }, async ({ browser, step }) => {
  const total = async (width: number, height: number): Promise<number> => {
    const context = await browser.newContext({ viewport: { width, height } })
    const page = await context.newPage()
    const images = recordImages(page)
    await page.goto(E2E.webUrl)
    await page.waitForLoadState("networkidle")
    await context.close()
    return images.reduce((sum, img) => sum + img.bytes, 0)
  }
  const shown = await browser.newPage()
  await step(
    "the same page weighs less on a phone viewport",
    async () => {
      const desktop = await total(1440, 900)
      const phone = await total(390, 844)
      await shown.setContent(
        `<body style="font:16px monospace;padding:24px"><h3>image bytes on the home page</h3><pre>desktop ${desktop}\nphone   ${phone}</pre></body>`,
      )
      expect(phone).toBeLessThan(desktop)
    },
    shown,
  )
  await shown.close()
})

test("fonts are self-hosted, light, and the Arabic one only loads on /ar", { tag: ["@fr", "@desktop"] }, async ({
  browser,
  step,
}) => {
  const fonts = async (path: string): Promise<{ url: string; bytes: number }[]> => {
    const context = await browser.newContext()
    const page = await context.newPage()
    const found: { url: string; bytes: number }[] = []
    page.on("response", async (res) => {
      if (!/font\//.test(res.headers()["content-type"] ?? "") && !/\.(woff2?|ttf|otf)(\?|$)/.test(res.url())) return
      const body = await res.body().catch(() => null)
      if (body) found.push({ url: res.url(), bytes: body.length })
    })
    await page.goto(`${E2E.webUrl}${path}`)
    await page.waitForLoadState("networkidle")
    await context.close()
    return found
  }
  const page = await browser.newPage()
  let french: { url: string; bytes: number }[] = []
  let arabic: { url: string; bytes: number }[] = []
  await step(
    "the French page serves its fonts from its own origin, within the budget",
    async () => {
      french = await fonts("/")
      await page.setContent(
        `<body style="font:14px monospace;padding:24px"><h3>fonts on /</h3><pre>${french.map((f) => `${f.bytes}  ${f.url}`).join("\n")}</pre></body>`,
      )
      expect(french.length).toBeGreaterThan(0)
      for (const font of french) expect(new URL(font.url).origin, font.url).toBe(E2E.webUrl)
      expect(french.reduce((sum, f) => sum + f.bytes, 0)).toBeLessThanOrEqual(BUDGETS.fontBytes.latin)
    },
    page,
  )
  await step(
    "the Arabic font is only fetched on /ar",
    async () => {
      arabic = await fonts("/ar")
      const urls = new Set(french.map((f) => f.url))
      const extra = arabic.filter((f) => !urls.has(f.url))
      await page.setContent(
        `<body style="font:14px monospace;padding:24px"><h3>fonts only on /ar</h3><pre>${extra.map((f) => `${f.bytes}  ${f.url}`).join("\n")}</pre></body>`,
      )
      expect(
        extra.length,
        `the Arabic page brings its own font: fr ${JSON.stringify(french)} ar ${JSON.stringify(arabic)}`,
      ).toBeGreaterThan(0)
      expect(arabic.reduce((sum, f) => sum + f.bytes, 0)).toBeLessThanOrEqual(BUDGETS.fontBytes.arabic)
    },
    page,
  )
  await page.close()
})
