import { expect, test } from "bun:test"
import { lengthParity, PARITY_BANDS, visibleText } from "@workspace/sdk"
import ar from "../messages/ar.json"
import en from "../messages/en.json"
import fr from "../messages/fr.json"
import { leaves } from "./helpers/messages"

const base = leaves(fr)

for (const [lang, messages] of [
  ["en", en],
  ["ar", ar],
] as const) {
  test(`${lang} strings stay about as long as the french`, () => {
    const other = leaves(messages)
    const failing: string[] = []
    for (const [key, source] of base) {
      const frText = visibleText(source, "fr")
      const otherText = visibleText(other.get(key) ?? "", lang)
      const { ok, ratio } = lengthParity(frText, otherText, PARITY_BANDS[lang])
      if (!ok) failing.push(`${key} | ${lang} | ${frText} | ${otherText} | ${ratio.toFixed(2)}`)
    }
    expect(failing).toEqual([])
  })
}
