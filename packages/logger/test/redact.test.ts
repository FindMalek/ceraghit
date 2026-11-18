import { expect, test } from "bun:test"
import { REDACTED, redact } from "../src/redact"

test("a customer's details never reach a log line", () => {
  const redacted = redact({
    customer: { email: "someone@example.com", phone: "+216 20 123 456", address: "12 rue de Rome" },
    email: "buyer@example.com",
    authorization: "Bearer sk_live_123",
    payUrl: "https://pay.konnect.network/xyz",
    iban: "TN5910006035183598478831",
  }) as Record<string, unknown>

  expect(redacted.email).toBe(REDACTED)
  expect(redacted.authorization).toBe(REDACTED)
  expect(redacted.payUrl).toBe(REDACTED)
  expect(redacted.iban).toBe(REDACTED)
  expect(redacted.customer).toEqual({ email: REDACTED, phone: REDACTED, address: REDACTED })
})

test("an address written inside a sentence keeps its domain only", () => {
  expect(redact({ note: "write to buyer@example.com before friday" })).toEqual({
    note: "write to ***@example.com before friday",
  })
})

test("what a dashboard needs to read survives", () => {
  const kept = { number: "CER-48213", totalMinor: 34_500, currency: "TND", country: "TN", status: "paid", ms: 42 }
  expect(redact(kept)).toEqual(kept)
})
