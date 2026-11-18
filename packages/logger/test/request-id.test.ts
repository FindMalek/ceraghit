import { expect, test } from "bun:test"
import { resolveRequestId } from "../src"

test("a plain inbound request id is kept", () => {
  expect(resolveRequestId("6f1c2a9e-3b7d-4a51-9d3e-2f1b0c8a7d64")).toBe("6f1c2a9e-3b7d-4a51-9d3e-2f1b0c8a7d64")
})

test("an id with spaces, or one too long, is replaced by a fresh uuid", () => {
  expect(resolveRequestId("not an id")).not.toBe("not an id")
  expect(resolveRequestId("a".repeat(200))).toMatch(/^[0-9a-f-]{36}$/)
  expect(resolveRequestId(null)).toMatch(/^[0-9a-f-]{36}$/)
})
