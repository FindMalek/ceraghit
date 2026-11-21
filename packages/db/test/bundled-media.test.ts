import { expect, test } from "bun:test"
import { readdirSync, statSync } from "node:fs"
import { BUNDLED_MEDIA } from "../src/seed/bundled-media"

const PUBLIC = new URL("../../../apps/web/public/", import.meta.url)

test("the manifest lists every bundled picture with its real size", () => {
  const onDisk = [
    ...readdirSync(new URL("catalogue/", PUBLIC))
      .filter((f) => f.endsWith(".webp"))
      .map((f) => `/catalogue/${f}`),
    "/logo.webp",
    "/texture.webp",
  ]
  expect(BUNDLED_MEDIA.map((m) => m.key).sort()).toEqual(onDisk.sort())
  for (const m of BUNDLED_MEDIA) expect(statSync(new URL(m.key.slice(1), PUBLIC)).size).toBe(m.bytes)
})
