import { expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import { errorReason } from "../../lib/errors"

test("the reason comes from the api error, anything else has none", () => {
  const known = new ORPCError("BAD_REQUEST", { message: "x", data: { reason: "payment_method_unavailable" } })
  expect(errorReason(known)).toBe("payment_method_unavailable")
  expect(errorReason(new ORPCError("BAD_REQUEST", { message: "x", data: { reason: "made_up" } }))).toBeNull()
  expect(errorReason(new ORPCError("INTERNAL_SERVER_ERROR", { message: "x" }))).toBeNull()
  expect(errorReason(new TypeError("Failed to fetch"))).toBeNull()
})
