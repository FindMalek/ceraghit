import { describe, expect, test } from "bun:test"
import { parseMediaQuery, toSearchParams } from "../lib/media-query"

const parse = (search: string) => parseMediaQuery(new URLSearchParams(search))

describe("media query", () => {
  test("round-trips through the url", () => {
    const query = { q: "vase", sort: "size" as const, filter: "unused" as const, tag: "bleu" }
    expect(parse(toSearchParams(query).toString())).toEqual(query)
    expect(toSearchParams({ q: "", sort: "newest", filter: "all", tag: "" }).toString()).toBe("")
  })

  test("ignores junk and understands ?unused=1", () => {
    expect(parse("sort=nope&filter=x&q=%20a%20")).toEqual({ q: "a", sort: "newest", filter: "all", tag: "" })
    expect(parse("unused=1").filter).toBe("unused")
  })
})
