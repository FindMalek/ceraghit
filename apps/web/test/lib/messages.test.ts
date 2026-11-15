import { expect, test } from "bun:test"
import ar from "../../messages/ar.json"
import en from "../../messages/en.json"
import fr from "../../messages/fr.json"
import { leaves } from "../helpers/messages"

/** ICU argument names and rich-text tags: `{count, plural, ...}` gives count, `<link>` gives <link>. */
function placeholders(message: string): string[] {
  const args = [...message.matchAll(/\{([a-zA-Z_]+)(?=[,}])/g)].map((m) => m[1] as string)
  const tags = [...message.matchAll(/<(\/?[a-z]+)>/g)].map((m) => `<${m[1]}>`)
  return [...new Set([...args, ...tags])].sort()
}

const base = leaves(fr)

for (const [name, messages] of [
  ["en", en],
  ["ar", ar],
] as const) {
  test(`${name} has every french key, no extra, and keeps placeholders`, () => {
    const other = leaves(messages)
    expect([...other.keys()].filter((k) => !base.has(k))).toEqual([])
    expect([...base.keys()].filter((k) => !other.has(k))).toEqual([])
    const drifted = [...base].filter(
      ([key, text]) => placeholders(text).join() !== placeholders(other.get(key) ?? "").join(),
    )
    expect(drifted.map(([key]) => key)).toEqual([])
  })
}
