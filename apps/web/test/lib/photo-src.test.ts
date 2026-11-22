import { expect, test } from "bun:test"
import { photoSrc } from "../../lib/photo-src"

test("an uploaded photo goes to the public CDN host when there is one, and stays the signed redirect otherwise", () => {
  expect(photoSrc("/api/files/media/ab/cd.webp", "https://cdn.ceraghit.com")).toBe(
    "https://cdn.ceraghit.com/media/ab/cd.webp",
  )
  expect(photoSrc("/api/files/media/ab/cd.webp", "")).toBe("/api/files/media/ab/cd.webp")
  expect(photoSrc("/catalogue/0010-1.webp", "https://cdn.ceraghit.com")).toBe("/catalogue/0010-1.webp")
})
