import { describe, expect, test } from "bun:test"
import { z } from "zod"
import { adminRouter } from "../src/routers/admin"

const SENSITIVE = /(secret|password|pass|apikey|api_key|token|privatekey)/i
/** "pin" on its own or as a camelCase / snake_case word, not inside "shipping". */
const PIN = /(^pin$|[a-z]Pin$|_pin$|PIN)/
const sensitive = (name: string) => SENSITIVE.test(name) || PIN.test(name)
/** Property names that look sensitive but are not: the masked vault summary and non-secret ids. */
const ALLOWED: Record<string, string[]> = {
  "integrations.get": ["secrets"],
  "integrations.list": ["secrets"],
  "integrations.save": ["secrets"],
  "shipping.getSettings": ["secrets"],
  "shipping.saveSettings": ["secrets"],
  // Token counts are usage numbers, not credentials.
  "ai.status": ["tokensIn", "tokensOut"],
  "ai.translate": ["tokensIn", "tokensOut"],
}

type Procedure = { "~orpc": { outputSchema?: z.ZodType } }
const isProcedure = (v: unknown): v is Procedure => typeof v === "object" && v !== null && "~orpc" in v

function names(node: unknown, out: Set<string>) {
  if (Array.isArray(node)) {
    for (const n of node) names(n, out)
    return
  }
  if (typeof node !== "object" || node === null) return
  for (const [key, value] of Object.entries(node)) {
    if (key === "properties" && typeof value === "object" && value) {
      for (const prop of Object.keys(value)) out.add(prop)
    }
    names(value, out)
  }
}

describe("admin outputs", () => {
  test("no output schema has a secret-looking property", () => {
    const offenders: string[] = []
    const walk = (node: object, path: string[]) => {
      for (const [key, value] of Object.entries(node)) {
        if (isProcedure(value)) {
          const schema = value["~orpc"].outputSchema
          if (!schema) continue
          const found = new Set<string>()
          names(z.toJSONSchema(schema, { unrepresentable: "any", io: "output" }), found)
          const id = [...path, key].join(".")
          for (const name of found) {
            if (sensitive(name) && !ALLOWED[id]?.includes(name)) offenders.push(`${id}.${name}`)
          }
        } else if (typeof value === "object" && value) walk(value, [...path, key])
      }
    }
    walk(adminRouter, [])
    expect(offenders).toEqual([])
  })
})
