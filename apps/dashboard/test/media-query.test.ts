import { describe, expect, test } from "bun:test"
import { applyFilter, parseMediaQuery, toListInput, toSearchParams } from "../lib/media-query"

const parse = (search: string) => parseMediaQuery(new URLSearchParams(search))

describe("media query", () => {
  test("round-trips through the url", () => {
    const query = { q: "vase", sort: "size" as const, filter: "expiring" as const, tag: "bleu" }
    expect(parse(toSearchParams(query).toString())).toEqual(query)
    expect(toSearchParams({ q: "", sort: "newest", filter: "all", tag: "" }).toString()).toBe("")
  })

  test("ignores junk and understands ?unused=1", () => {
    expect(parse("sort=nope&filter=x&q=%20a%20")).toEqual({ q: "a", sort: "newest", filter: "all", tag: "" })
    expect(parse("unused=1").filter).toBe("unused")
  })

  test("expiring asks the api for unused and keeps only photos deleted within 7 days", () => {
    const now = Date.parse("2026-11-16T00:00:00Z")
    const day = (n: number) => new Date(now + n * 86_400_000).toISOString()
    const media = (id: string, deletesAt: string | null, keep = false) => ({ id, deletesAt, keep }) as never
    expect(toListInput({ q: "", sort: "newest", filter: "expiring", tag: "" })).toEqual({
      sort: "newest",
      unused: true,
    })
    const kept = applyFilter(
      [media("a", day(3)), media("b", day(20)), media("c", null), media("d", day(1), true)],
      "expiring",
      now,
    )
    expect(kept.map((m) => m.id)).toEqual(["a"])
  })
})
