import { expect, test } from "bun:test"
import { CATALOGUE, CATEGORIES } from "./catalogue"
import { localize } from "./translations"

test("every catalogue text has an english and an arabic version", () => {
  const texts = [
    ...CATEGORIES.map((c) => c.name.fr),
    ...CATALOGUE.flatMap((p) => [p.title, p.material, p.technique, ...(p.description ? [p.description] : [])]),
  ]
  const missing = [...new Set(texts)].filter((text) => {
    const { en, ar } = localize(text)
    return !en || !ar
  })
  expect(missing).toEqual([])
})
