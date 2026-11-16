import { describe, expect, test } from "bun:test"
import { mergeTranslation } from "../lib/localized"

describe("mergeTranslation", () => {
  test("fills only the empty languages", () => {
    const { values, filled } = mergeTranslation({ fr: "Vase", en: "", ar: "" }, { en: "Vase", ar: "مزهرية" })
    expect(values).toEqual({ fr: "Vase", en: "Vase", ar: "مزهرية" })
    expect(filled).toEqual(["en", "ar"])
  })

  test("never overwrites a language typed while the request ran", () => {
    const { values, filled } = mergeTranslation(
      { fr: "Vase", en: "My own English", ar: "" },
      { en: "Vase", ar: "مزهرية" },
    )
    expect(values.en).toBe("My own English")
    expect(filled).toEqual(["ar"])
  })

  test("keeps the source untouched", () => {
    const { filled } = mergeTranslation({ fr: "Vase", en: "", ar: "" }, { fr: "Should not replace" })
    expect(filled).toEqual([])
  })
})
