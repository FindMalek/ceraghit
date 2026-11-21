import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { parseVideo } from "../lib/steps"

const base = { id: "01", slug: "x", title_fr: "X", start: { app: "web", path: "/", loggedIn: false } }

test("a step without a French caption or with an unknown action is refused", () => {
  expect(() => parseVideo({ ...base, steps: [{ action: "wait" }] })).toThrow()
  expect(() => parseVideo({ ...base, steps: [{ action: "teleport", caption_fr: "Ok" }] })).toThrow()
})

test("the sample video file is valid", () => {
  const file = new URL("../videos/03-connexion.json", import.meta.url)
  expect(parseVideo(JSON.parse(readFileSync(file, "utf8"))).slug).toBe("connexion")
})
