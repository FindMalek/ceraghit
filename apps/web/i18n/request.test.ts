import { expect, test } from "bun:test"
import { withFallback } from "./request"

test("a translated list stays a list and a missing key falls back to french", () => {
  const merged = withFallback(
    { legal: { sections: [{ title: "Un" }, { title: "Deux" }], note: "fr" }, only: "fr" },
    { legal: { sections: [{ title: "One" }, { title: "Two" }] } },
  )
  expect(Array.isArray((merged.legal as { sections: unknown }).sections)).toBe(true)
  expect(merged).toEqual({ legal: { sections: [{ title: "One" }, { title: "Two" }], note: "fr" }, only: "fr" })
})
