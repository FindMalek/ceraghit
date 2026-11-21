import { expect, test } from "bun:test"
import { parseTutorialQuery, toTutorialSearchParams } from "../lib/tutorial-query"

test("the help url round-trips and drops unknown areas, audiences, tags and videos", () => {
  const query = {
    q: "panier",
    area: "checkout" as const,
    audience: "customer" as const,
    tag: "panier",
    video: "13-ajouter-au-panier",
  }
  expect(parseTutorialQuery(new URLSearchParams(toTutorialSearchParams(query).toString()))).toEqual(query)
  expect(parseTutorialQuery(new URLSearchParams("q=%20a%20&area=nope&audience=x&tag=nope&video=99-inconnu"))).toEqual({
    q: "a",
    area: null,
    audience: null,
    tag: null,
    video: null,
  })
  expect(toTutorialSearchParams({ q: " ", area: null, audience: null, tag: null, video: null }).toString()).toBe("")
})
