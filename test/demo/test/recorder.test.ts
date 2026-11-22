import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium } from "@playwright/test"
import { FFMPEG, FPS, startRecording } from "../lib/recorder"

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

test("an event at recording.now() T shows in the video at T, so cues and narration start with their step", async () => {
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
    expect(Math.abs(firstBrightSecond(file) * 1000 - at)).toBeLessThan(150)
  } finally {
    await browser.close()
    rmSync(dir, { recursive: true, force: true })
  }
}, 30_000)
