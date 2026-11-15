import { expect, test } from "bun:test"
import { PUBLIC_ERROR_REASONS } from "@workspace/sdk"
import ar from "../messages/ar.json"
import en from "../messages/en.json"
import fr from "../messages/fr.json"

test("every public api error reason has a message in fr, en and ar", () => {
  const missing: string[] = []
  for (const [lang, messages] of [
    ["fr", fr],
    ["en", en],
    ["ar", ar],
  ] as const) {
    const texts: Record<string, string> = messages.errors.api
    for (const reason of PUBLIC_ERROR_REASONS) {
      if (!texts[reason]?.trim()) missing.push(`${lang}.${reason}`)
    }
    const extra = Object.keys(texts).filter((key) => !PUBLIC_ERROR_REASONS.some((reason) => reason === key))
    expect(extra, `${lang} has messages for reasons that no longer exist`).toEqual([])
  }
  expect(missing).toEqual([])
})
