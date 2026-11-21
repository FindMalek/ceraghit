import { expect, test } from "bun:test"
import { siteImages } from "../../lib/site-images"

const entry = (image: string, alt: { fr: string; ar?: string } | null) => ({ image, alt, width: 10, height: 20 })

test("a missing slot falls back to the bundled hero photos with no alt", () => {
  const slides = siteImages("hero", {}, "fr")
  expect(slides.length).toBeGreaterThan(0)
  expect(slides.every((s) => s.src.startsWith("/catalogue/") && s.alt === "")).toBe(true)
})

test("database entries keep their order and the alt follows the locale, falling back to fr", () => {
  const data = { hero: [entry("s3:b.webp", { fr: "Deux", ar: "اثنان" }), entry("s3:a.webp", { fr: "Un" })] }
  expect(siteImages("hero", data, "ar").map((s) => [s.src, s.alt])).toEqual([
    ["/api/files/b.webp", "اثنان"],
    ["/api/files/a.webp", "Un"],
  ])
  expect(siteImages("hero", data, "en")[0]?.alt).toBe("Deux")
})
