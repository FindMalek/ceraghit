import { describe, expect, test } from "bun:test"
import type { Media } from "@workspace/sdk"
import { addImages, type GalleryItem, moveImage, removeImage, replaceImage, setMain } from "../lib/gallery"

const item = (id: string, isMain = false): GalleryItem => ({
  mediaId: id,
  isMain,
  alt: null,
  image: `/${id}.webp`,
  libraryAlt: null,
  width: null,
  height: null,
})
const media = (id: string) => ({ id, src: `/${id}.webp`, alt: null, width: 1, height: 1 }) as Media
const ids = (l: GalleryItem[]) => l.map((i) => i.mediaId)

describe("gallery helpers", () => {
  const list = [item("a", true), item("b"), item("c")]

  test("moves first to second and last to first", () => {
    expect(ids(moveImage(list, 0, 1))).toEqual(["b", "a", "c"])
    expect(ids(moveImage(list, 2, 0))).toEqual(["c", "a", "b"])
    expect(moveImage(list, 0, 5)).toBe(list)
  })

  test("setMain keeps exactly one main", () => {
    const next = setMain(list, "c")
    expect(next.filter((i) => i.isMain).map((i) => i.mediaId)).toEqual(["c"])
  })

  test("removing the main promotes the first remaining photo", () => {
    const next = removeImage(list, 0)
    expect(ids(next)).toEqual(["b", "c"])
    expect(next.map((i) => i.isMain)).toEqual([true, false])
    expect(removeImage([item("a", true)], 0)).toEqual([])
  })

  test("replace keeps position and main, and refuses a photo already in the list", () => {
    const next = replaceImage(list, 0, media("z"))
    expect(next.map((i) => [i.mediaId, i.isMain])).toEqual([
      ["z", true],
      ["b", false],
      ["c", false],
    ])
    expect(replaceImage(list, 1, media("c"))).toBe(list)
  })

  test("adding skips duplicates, stops at twelve and makes the first main", () => {
    expect(ids(addImages([], [media("a"), media("a"), media("b")]))).toEqual(["a", "b"])
    expect(addImages([], [media("a")])[0]?.isMain).toBe(true)
    const full = Array.from({ length: 12 }, (_, n) => item(`x${n}`, n === 0))
    expect(addImages(full, [media("new")])).toHaveLength(12)
  })
})
