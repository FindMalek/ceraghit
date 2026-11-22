import { expect, test } from "bun:test"
import { sidebarLogoSrc } from "../lib/site-slot"

test("the sidebar shows the logo slot whether it is uploaded or bundled, and keeps its own default", () => {
  expect(sidebarLogoSrc("s3:logo/new.webp", "https://web.test")).toBe("/api/files/logo/new.webp")
  expect(sidebarLogoSrc("/catalogue/other-logo.webp", "https://web.test")).toBe(
    "https://web.test/catalogue/other-logo.webp",
  )
  expect(sidebarLogoSrc("/logo.webp", "https://web.test")).toBeUndefined()
  expect(sidebarLogoSrc(undefined, "https://web.test")).toBeUndefined()
})
