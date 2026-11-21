import { expect, test } from "bun:test"
import { parseArgs } from "../lib/args"

test("device and option values are validated", () => {
  expect(parseArgs(["--", "03", "--voice", "--device=mobile"])).toMatchObject({ ids: ["03"], device: "mobile" })
  expect(() => parseArgs(["--device=tablet"])).toThrow("desktop or mobile")
  expect(() => parseArgs(["--voice=fr"])).toThrow("draft or final")
  expect(() => parseArgs(["--bogus"])).toThrow("unknown option")
  expect(() => parseArgs(["3"])).toThrow("two digits")
})

test("voice is draft by default when bare, final only when asked", () => {
  expect(parseArgs(["--voice"]).voice).toBe("draft")
  expect(parseArgs(["--voice=final", "--plan"])).toMatchObject({ voice: "final" })
  expect(parseArgs(["--plan"]).flags.has("plan")).toBe(true)
  expect(parseArgs([]).voice).toBeUndefined()
})
