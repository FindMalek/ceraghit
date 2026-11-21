/**
 * Storefront performance budgets, asserted by `specs/perf/web-vitals.e2e.ts` against the production build.
 * Mobile is throttled (4x CPU, fast 3G-ish network), desktop is not. Lower a number when the site gets faster, raise
 * one only with a reason in the PR: they are the contract with the visitors on a phone in Tunis.
 */
export const BUDGETS = {
  /** Median of three loads, in ms. */
  lcpMs: { desktop: 2000, mobile: 3500 },
  /** Layout shift score, same on both. */
  cls: 0.05,
  /** Bytes of the image that is the LCP element. */
  heroBytes: { desktop: 450 * 1024, mobile: 250 * 1024 },
  /** Any single image of a page. */
  imageBytes: 500 * 1024,
  /** All image bytes fetched by the first viewport of the home page. */
  homeImagesBytes: 900 * 1024,
  /** Images the shop grid may request on load: the first viewport plus a small look-ahead. */
  shopLookAhead: 4,
  /** Every font file of a page together. The Arabic faces only load on /ar (`preload: false` in `packages/ui/src/fonts.ts`). */
  fontBytes: { latin: 250 * 1024, arabic: 450 * 1024 },
} as const

export const FAST_3G = { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 }
export const CPU_SLOWDOWN = 4
