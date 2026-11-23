import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium } from "@playwright/test"
import { FFMPEG, FPS, mux, startRecording } from "../lib/recorder"
import { abortRecording, runGuarded } from "../lib/safety"

/** Seconds into the video of the first frame whose brightness is above half. */
function firstBrightSecond(file: string): number {
  const res = spawnSync(
    FFMPEG,
    ["-v", "error", "-i", file, "-vf", `fps=${FPS},scale=2:2,format=gray`, "-f", "rawvideo", "-"],
    { maxBuffer: 64 * 1024 * 1024 },
  )
  const bytes = res.stdout
  for (let i = 0; i + 3 < bytes.length; i += 4) {
    if (((bytes[i] ?? 0) + (bytes[i + 1] ?? 0) + (bytes[i + 2] ?? 0) + (bytes[i + 3] ?? 0)) / 4 > 128)
      return i / 4 / FPS
  }
  return -1
}

const haveFfmpeg = spawnSync(FFMPEG, ["-version"]).status === 0

test.skipIf(!haveFfmpeg && !process.env.CI)(
  "an event at recording.now() T shows in the video at T, so cues and narration start with their step",
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "demo-rec-"))
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage({ viewport: { width: 200, height: 120 } })
      // A moving dot keeps frames coming, like a real page, so the clock is checked after many frames too.
      await page.setContent(
        '<body style="margin:0;background:#000"><i id="m" style="position:fixed;top:0;left:0;width:4px;height:4px;background:#222"></i><script>let x=0;(function f(){document.getElementById("m").style.left=(x++%150)+"px";requestAnimationFrame(f)})()</script>',
      )
      const file = join(dir, "t.mp4")
      const recording = await startRecording(page, file, { width: 200, height: 120 })
      await new Promise((r) => setTimeout(r, 4000))
      const at = recording.now()
      await page.evaluate(() => {
        document.body.style.background = "#fff"
      })
      await new Promise((r) => setTimeout(r, 800))
      await recording.stop()
      expect(Math.abs(firstBrightSecond(file) * 1000 - at)).toBeLessThan(250)
    } finally {
      await browser.close()
      rmSync(dir, { recursive: true, force: true })
    }
  },
  30_000,
)

test.skipIf(!haveFfmpeg && !process.env.CI)(
  "the video keeps the recording clock over a long run of 40 ms ticks (no per-frame rounding drift)",
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "demo-rec-"))
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage({ viewport: { width: 200, height: 120 } })
      await page.setContent(
        '<body style="margin:0"><script>let n=0;setInterval(()=>{document.body.style.background="hsl("+(n++*7%360)+",80%,50%)"},40)</script>',
      )
      const file = join(dir, "t.mp4")
      const recording = await startRecording(page, file, { width: 200, height: 120 })
      await new Promise((r) => setTimeout(r, 30_000))
      const now = recording.now()
      await recording.stop()
      const probe = spawnSync(
        process.env.FFPROBE || "ffprobe",
        ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
        { encoding: "utf8" },
      )
      expect(Math.abs(Number.parseFloat(probe.stdout) * 1000 - now)).toBeLessThan(150)
    } finally {
      await browser.close()
      rmSync(dir, { recursive: true, force: true })
    }
  },
  60_000,
)

test("a hung ffmpeg in mux fails fast and the run cleanup removes its files", async () => {
  const dir = mkdtempSync(join(tmpdir(), "demo-mux-"))
  try {
    const fake = join(dir, "ffmpeg")
    writeFileSync(fake, "#!/bin/sh\nsleep 30\n")
    chmodSync(fake, 0o755)
    const raw = join(dir, "a.raw.mp4")
    const out = join(dir, "a.mp4")
    writeFileSync(raw, "x")
    writeFileSync(out, "x")
    const started = Date.now()
    await expect(
      runGuarded(async () => mux(raw, out, [], undefined, { ffmpeg: fake, timeoutMs: 300 }), {
        ms: 10_000,
        label: () => "mux",
        cleanup: () => abortRecording({ files: [raw, out], browser: { close: async () => {} } }),
      }),
    ).rejects.toThrow(/did not finish within 300 ms/)
    expect(Date.now() - started).toBeLessThan(5000)
    expect(existsSync(raw) || existsSync(out)).toBe(false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
