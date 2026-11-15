import { expect, test } from "bun:test"
import { youtubeId } from "../src/tutorials"

test("a pasted youtube link becomes the bare video id, anything else is refused", () => {
  for (const pasted of [
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12s",
    "youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0",
    " dQw4w9WgXcQ ",
  ])
    expect(youtubeId(pasted)).toBe("dQw4w9WgXcQ")
  expect(youtubeId("https://vimeo.com/watch?v=dQw4w9WgXcQ")).toBeNull()
  expect(youtubeId("https://youtu.be/dQw4w9WgXc")).toBeNull()
})
