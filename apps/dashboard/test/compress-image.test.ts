import { afterEach, describe, expect, mock, test } from "bun:test"
import { assertMediaSize, compressImage, UNSUPPORTED_FORMAT } from "../lib/compress-image"

const g = globalThis as Record<string, unknown>
const saved = { createImageBitmap: g.createImageBitmap, document: g.document }
afterEach(() => Object.assign(g, saved))

/** Only the browser boundary is faked: decoding and the canvas encoder. */
function browser(size: { width: number; height: number }, encodes: string) {
  g.createImageBitmap = async () => ({ ...size, close() {} })
  g.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }),
      toBlob: (cb: (b: Blob) => void) => cb(new Blob(["x"], { type: encodes })),
    }),
  }
}
const file = (type: string) => new File([new Uint8Array(100)], "a.png", { type })

describe("compressImage", () => {
  test("a browser that cannot encode WebP (Safari) falls back to the wasm encoder", async () => {
    mock.module("@jsquash/webp/encode", () => ({ default: async () => new Uint8Array([1, 2, 3]).buffer }))
    browser({ width: 800, height: 600 }, "image/png")
    const out = await compressImage(file("image/png"))
    expect(out.type).toBe("image/webp")
    expect(out.name).toBe("a.webp")
  })

  test("a file the browser cannot decode (heic) gets a clear message", async () => {
    g.createImageBitmap = async () => {
      throw new Error("decode")
    }
    await expect(compressImage(file("image/heic"))).rejects.toThrow(UNSUPPORTED_FORMAT)
  })

  test("a WebP within the limits is returned untouched", async () => {
    browser({ width: 800, height: 600 }, "image/webp")
    const original = file("image/webp")
    expect(await compressImage(original)).toBe(original)
  })

  test("a small icon is not rejected", async () => {
    browser({ width: 64, height: 64 }, "image/webp")
    expect((await compressImage(file("image/png"))).type).toBe("image/webp")
  })
})

test("the media path refuses a picture under 200px", () => {
  expect(() => assertMediaSize(150, 900)).toThrow("trop petite")
  expect(() => assertMediaSize(200, 200)).not.toThrow()
})
