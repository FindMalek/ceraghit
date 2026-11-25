import { expect, test } from "bun:test"
import { setupStepHref } from "../lib/setup-links"

test("each open step links to where it is finished", () => {
  expect(setupStepHref("owner")).toBe("/settings/profile#owner")
  expect(setupStepHref("bank")).toBe("/settings/profile#bank")
  expect(setupStepHref("shipping")).toBe("/shipping")
  expect(setupStepHref("payoneer")).toBeNull()
  expect(setupStepHref("emailDomain")).toBe("/settings")
})
