import { spawnSync } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { deflateSync } from "node:zlib"
import { FFMPEG } from "./recorder"

type Rgb = [number, number, number]

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 255]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data])
  const out = Buffer.alloc(body.length + 8)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), body.length + 4)
  return out
}

/** An RGB PNG written by hand, so the recorder needs no image library and no binary lives in the repo. */
export function makePng(width: number, height: number, pixel: (x: number, y: number) => Rgb): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const rows = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    const at = y * (width * 3 + 1)
    for (let x = 0; x < width; x++) rows.set(pixel(x, y), at + 1 + x * 3)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

/** A glazed bowl seen from above: rings of one hue on a soft background, a different hue per piece. */
export function ceramicPixel(hue: number, width: number, height: number): (x: number, y: number) => Rgb {
  const base: Rgb[] = [
    [196, 112, 78],
    [64, 112, 128],
    [201, 164, 92],
    [112, 128, 96],
  ]
  const color = base[hue % base.length]!
  return (x, y) => {
    const dx = (x - width / 2) / (width / 2)
    const dy = (y - height / 2) / (height / 2)
    const r = Math.hypot(dx, dy)
    if (r > 0.82) return [238, 230, 218]
    const ring = 0.5 + 0.5 * Math.cos(r * 28)
    const shade = 0.72 + 0.28 * ring - 0.18 * r
    return color.map((c) => Math.max(0, Math.min(255, Math.round(c * shade)))) as Rgb
  }
}

export interface AssetSpec {
  name: string
  kind: "png" | "webp" | "text"
  hue?: number
  width?: number
  height?: number
}

/** Everything an upload step may name, under `out/assets`. */
export const ASSETS: AssetSpec[] = [
  { name: "photo-1.png", kind: "png", hue: 0, width: 900, height: 900 },
  { name: "photo-2.png", kind: "png", hue: 1, width: 900, height: 900 },
  { name: "photo-3.png", kind: "png", hue: 2, width: 900, height: 900 },
  { name: "photo-1.webp", kind: "webp", hue: 0, width: 900, height: 900 },
  { name: "photo-2.webp", kind: "webp", hue: 1, width: 900, height: 900 },
  { name: "banner-1.png", kind: "png", hue: 3, width: 1600, height: 700 },
  { name: "banner-1.webp", kind: "webp", hue: 3, width: 1600, height: 700 },
  { name: "not-an-image.txt", kind: "text" },
]

export interface AssetReport {
  written: string[]
  skipped: string[]
}

/** Writes the fixtures into `dir` (created, ignored by git). A webp needs an ffmpeg with libwebp; without it the file is skipped and listed. */
export function generateAssets(dir: string, ffmpeg: string = FFMPEG): AssetReport {
  mkdirSync(dir, { recursive: true })
  const report: AssetReport = { written: [], skipped: [] }
  for (const spec of ASSETS) {
    const file = join(dir, spec.name)
    if (spec.kind === "text") {
      writeFileSync(file, "Ceci n'est pas une image.\n")
    } else {
      const { width = 900, height = 900, hue = 0 } = spec
      const png = makePng(width, height, ceramicPixel(hue, width, height))
      if (spec.kind === "png") {
        writeFileSync(file, png)
      } else {
        const tmp = join(dir, `${spec.name}.tmp.png`)
        writeFileSync(tmp, png)
        const res = spawnSync(
          ffmpeg,
          ["-y", "-loglevel", "error", "-i", tmp, "-c:v", "libwebp", "-quality", "80", file],
          {
            encoding: "utf8",
          },
        )
        rmSync(tmp, { force: true })
        if (res.status !== 0) {
          rmSync(file, { force: true })
          report.skipped.push(spec.name)
          continue
        }
      }
    }
    report.written.push(spec.name)
  }
  return report
}
