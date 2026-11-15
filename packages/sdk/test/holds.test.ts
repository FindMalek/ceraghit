import { expect, test } from "bun:test"
import { DEFAULT_HOLDS, holdExpiresAt, holdExpiresSoon } from "../src/schemas"

const createdAt = new Date("2026-11-10T09:00:00Z")

test("transfer expires after transferDays, cod and card never by default", () => {
  expect(holdExpiresAt({ paymentMethod: "transfer", createdAt }, DEFAULT_HOLDS)?.toISOString()).toBe(
    "2026-11-17T09:00:00.000Z",
  )
  expect(holdExpiresAt({ paymentMethod: "cod", createdAt }, DEFAULT_HOLDS)).toBeNull()
  expect(holdExpiresAt({ paymentMethod: "online", createdAt }, DEFAULT_HOLDS)).toBeNull()
  expect(holdExpiresAt({ paymentMethod: "cod", createdAt }, { ...DEFAULT_HOLDS, codDays: 3 })?.toISOString()).toBe(
    "2026-11-13T09:00:00.000Z",
  )
})

test("the warning starts warnDays before the release", () => {
  const expires = new Date("2026-11-17T09:00:00Z")
  expect(holdExpiresSoon(expires, new Date("2026-11-14T09:00:00Z"), DEFAULT_HOLDS)).toBe(false)
  expect(holdExpiresSoon(expires, new Date("2026-11-15T09:00:00Z"), DEFAULT_HOLDS)).toBe(true)
})
