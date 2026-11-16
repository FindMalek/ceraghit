import { expect, test } from "bun:test"
import { readWebpSize } from "../src/webp"

const text = (s: string) => [...s].map((c) => c.charCodeAt(0))
const u32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]

function riff(chunk: string, data: number[]): Uint8Array {
  const body = [...text("WEBP"), ...text(chunk), ...u32(data.length), ...data]
  return Uint8Array.from([...text("RIFF"), ...u32(body.length), ...body])
}

test("reads the size of a lossy, a lossless and an extended WebP header", () => {
  const vp8 = riff("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, ...[0x40, 0x06], ...[0xb0, 0x04], 0, 0, 0, 0])
  const vp8l = riff("VP8L", [0x2f, ...u32(1599 | (1199 << 14)), 0, 0, 0, 0, 0, 0])
  const vp8x = riff("VP8X", [0, 0, 0, 0, ...[0x1f, 0x03, 0], ...[0x57, 0x02, 0], 0, 0, 0, 0])
  expect(readWebpSize(vp8)).toEqual({ width: 1600, height: 1200 })
  expect(readWebpSize(vp8l)).toEqual({ width: 1600, height: 1200 })
  expect(readWebpSize(vp8x)).toEqual({ width: 800, height: 600 })
})

test("anything that is not a WebP gives null", () => {
  const png = Uint8Array.from([0x89, ...text("PNG"), 13, 10, 26, 10, ...new Array(40).fill(0)])
  expect(readWebpSize(png)).toBeNull()
  expect(readWebpSize(riff("VP8L", [0x2f, 0, 0, 0, 0]).subarray(0, 25))).toBeNull()
})
