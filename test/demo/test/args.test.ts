import { expect, test } from "bun:test"
import { parseArgs } from "../lib/args"

test("device and option values are validated", () => {
  expect(parseArgs(["--", "03", "--voice", "--device=mobile"])).toMatchObject({ ids: ["03"], device: "mobile" })
  expect(() => parseArgs(["--device=tablet"])).toThrow("desktop or mobile")
  expect(() => parseArgs(["--voice=fr"])).toThrow("unknown option")
  expect(() => parseArgs(["3"])).toThrow("two digits")
})
