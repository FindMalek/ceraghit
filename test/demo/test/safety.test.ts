import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium } from "@playwright/test"
import { FFMPEG, startRecording } from "../lib/recorder"
import {
  applyTimeouts,
  closingWaitMs,
  durationProblem,
  LAST_STEP_MIN_HOLD_MS,
  runGuarded,
  stepHoldMs,
  TAIL_MS,
  withDeadline,
} from "../lib/safety"

const haveFfmpeg = spawnSync(FFMPEG, ["-version"]).status === 0

test("a hung step fails within the deadline and names the step", async () => {
  const started = Date.now()
  const hung = new Promise<void>(() => {})
  await expect(withDeadline(hung, 100, () => "demo-desktop stuck at step 3/9 (click: Ouvrez-la)")).rejects.toThrow(
    "demo-desktop stuck at step 3/9 (click: Ouvrez-la) did not finish within 100 ms",
  )
  expect(Date.now() - started).toBeLessThan(1000)
})

test("work that finishes in time returns its value", async () => {
  expect(await withDeadline(Promise.resolve(7), 1000, () => "x")).toBe(7)
})

test("a missing element fails at the page timeout, not at Playwright's 30 s", async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.setContent("<p>vide</p>")
    applyTimeouts(page, { action: 200, navigation: 300 })
    const started = Date.now()
    await expect(page.getByRole("button", { name: "Absent" }).waitFor()).rejects.toThrow("Timeout 200ms")
    expect(Date.now() - started).toBeLessThan(3000)
  } finally {
    await browser.close()
  }
}, 20_000)

test("a narrated last step waits only for its voice, and the video ends about a second after the audio", () => {
  const narrated = { holdMs: 2500, defaultHoldMs: 1200, spokenRemainingMs: 400, lastNarrated: true }
  expect(stepHoldMs(narrated)).toBe(LAST_STEP_MIN_HOLD_MS)
  const audioEnd = 20_000
  expect(closingWaitMs(audioEnd - 300, audioEnd, 1500)).toBe(TAIL_MS + 300)
  expect(closingWaitMs(audioEnd + 5000, audioEnd, 1500)).toBe(0)
})

test("a last step without narration keeps its hold, and a video without audio keeps its closing still", () => {
  expect(stepHoldMs({ holdMs: 2500, defaultHoldMs: 1200, spokenRemainingMs: 0, lastNarrated: false })).toBe(2500)
  expect(stepHoldMs({ defaultHoldMs: 1200, spokenRemainingMs: 0, lastNarrated: false })).toBe(1200)
  expect(closingWaitMs(30_000, null, 1500)).toBe(1500)
})

test.skipIf(!haveFfmpeg)(
  "a hung run is cleaned up: ffmpeg is killed, the browser closed and the partial file removed",
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "demo-guard-"))
    const browser = await chromium.launch()
    const file = join(dir, "partial.mp4")
    try {
      const page = await browser.newPage({ viewport: { width: 200, height: 120 } })
      await page.setContent("<body>video</body>")
      const recording = await startRecording(page, file, { width: 200, height: 120 })
      const pid = recording.pid as number
      expect(alive(pid)).toBe(true)
      await expect(
        runGuarded(() => new Promise<void>(() => {}), {
          ms: 300,
          label: () => "demo-desktop stuck at step 2/5",
          cleanup: async () => {
            recording.kill()
            rmSync(file, { force: true })
            await browser.close()
          },
        }),
      ).rejects.toThrow("stuck at step 2/5 did not finish within 300 ms")
      await new Promise((r) => setTimeout(r, 300))
      expect(alive(pid)).toBe(false)
      expect(browser.isConnected()).toBe(false)
      expect(existsSync(file)).toBe(false)
    } finally {
      await browser.close().catch(() => {})
      rmSync(dir, { recursive: true, force: true })
    }
  },
  30_000,
)

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

test("a video far longer than its script, or over two minutes, fails", () => {
  expect(durationProblem(40_000, 30_000)).toBeNull()
  expect(durationProblem(70_000, 30_000)).toContain("stalled")
  expect(durationProblem(125_000, 90_000)).toContain("120 s")
})
