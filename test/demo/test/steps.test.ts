import { expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { TUTORIALS } from "../../../packages/sdk/src/tutorials"
import { DEFAULT_MAX_LINE, uniqueLines } from "../lib/narration"
import { parseVideo } from "../lib/steps"

const base = { id: "01", slug: "x", title_fr: "X", start: { app: "web", path: "/", loggedIn: false } }

test("a step without a French caption or with an unknown action is refused", () => {
  expect(() => parseVideo({ ...base, steps: [{ action: "wait" }] })).toThrow()
  expect(() => parseVideo({ ...base, steps: [{ action: "teleport", caption_fr: "Ok" }] })).toThrow()
})

test("every video file is named after a catalogue id and keeps its narration inside the budget", () => {
  const dir = new URL("../videos/", import.meta.url)
  const catalogue = new Set(TUTORIALS.map((t) => t.id))
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const video = parseVideo(JSON.parse(readFileSync(new URL(file, dir), "utf8")))
    expect(`${video.id}-${video.slug}.json`).toBe(file)
    expect(catalogue.has(`${video.id}-${video.slug}`)).toBe(true)
    const lines = uniqueLines(video)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(DEFAULT_MAX_LINE)
    expect(lines.join("").length).toBeLessThanOrEqual(450)
  }
})

test("a video can limit itself to desktop", () => {
  const video = parseVideo({
    ...base,
    devices: ["desktop"],
    steps: [
      { action: "wait", caption_fr: "Pour tous." },
      { action: "wait", caption_fr: "Mobile.", only: "mobile", voice: true },
    ],
  })
  expect(uniqueLines(video)).toEqual(["Pour tous."])
})
