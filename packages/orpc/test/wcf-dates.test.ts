import { describe, expect, test } from "bun:test"
import { fromWcfDate, toWcfDate } from "../src/lib/shipping/aramex/dates"

describe("wcf dates", () => {
  test("reads every wcf form and iso, ignoring the offset suffix", () => {
    expect(fromWcfDate("/Date(1731628800000+0100)/").getTime()).toBe(1731628800000)
    expect(fromWcfDate("/Date(-1)/").getTime()).toBe(-1)
    expect(fromWcfDate("2024-11-15T00:00:00.000Z").getTime()).toBe(1731628800000)
  })

  test("round-trips and rejects garbage", () => {
    const d = new Date("2026-11-16T10:00:00Z")
    expect(fromWcfDate(toWcfDate(d)).getTime()).toBe(d.getTime())
    expect(() => fromWcfDate("soon")).toThrow()
  })
})
