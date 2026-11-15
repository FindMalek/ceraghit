import { expect, test } from "bun:test"
import { compactAccount, formatAccount } from "../lib/format-account"

test("groups an iban by four while typing and stores it without spaces", () => {
  expect(formatAccount("tn5910006035183598478831")).toBe("TN59 1000 6035 1835 9847 8831")
  expect(formatAccount("TN59 1000-6035")).toBe("TN59 1000 6035")
  expect(compactAccount("TN59 1000 6035 1835 9847 8831")).toBe("TN5910006035183598478831")
})
