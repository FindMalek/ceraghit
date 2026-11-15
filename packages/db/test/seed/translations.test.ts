import { expect, test } from "bun:test"
import { CATALOGUE, CATEGORIES } from "../../src/seed/catalogue"
import { localize } from "../../src/seed/translations"

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
