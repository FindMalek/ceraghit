import { expect, test } from "bun:test"
import ar from "../messages/ar.json"
import en from "../messages/en.json"
import fr from "../messages/fr.json"

/** Every leaf path: `home.title`, `legal.docs.terms.sections.0.body.1`. */
function leaves(node: unknown, path = ""): Map<string, string> {
  if (typeof node === "string") return new Map([[path, node]])
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(node as object)) {
    for (const [p, v] of leaves(value, path ? `${path}.${key}` : key)) out.set(p, v)
  }
  return out
}

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
