import { expect, test } from "bun:test"
import { lengthParity, PARITY_BANDS } from "@workspace/sdk"
import { EMAIL_COPY } from "../src/emails/copy"

const flatten = (copy: object): Record<string, string> =>
  Object.fromEntries(
    Object.entries(copy).flatMap(([section, keys]) =>
      Object.entries(keys as Record<string, string | ((arg: string) => string)>).map(([key, v]) => [
        `${section}.${key}`,
        typeof v === "function" ? v("Sample 123") : v,
      ]),
    ),
  )

test("email copy is complete in en and ar and about as long as French", () => {
  const fr = flatten(EMAIL_COPY.fr)
  for (const lang of ["en", "ar"] as const) {
    const other = flatten(EMAIL_COPY[lang])
    expect(Object.keys(other).sort()).toEqual(Object.keys(fr).sort())
    for (const [key, text] of Object.entries(other)) {
      expect(text.trim().length, `${lang} ${key}`).toBeGreaterThan(0)
      expect(lengthParity(fr[key]!, text, PARITY_BANDS[lang]).ok, `${lang} ${key}`).toBe(true)
    }
  }
})
