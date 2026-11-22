import { expect, test } from "bun:test"
import { chromium } from "@playwright/test"
import {
  applyTimeouts,
  durationProblem,
  LAST_STEP_MIN_HOLD_MS,
  stepHoldMs,
  TAIL_MS,
  tailWaitMs,
  withDeadline,
} from "../lib/safety"

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

test("the last step waits only for its voice, so the video ends about a second after the audio", () => {
  const hold = stepHoldMs({ holdMs: 2500, defaultHoldMs: 1200, spokenRemainingMs: 400, last: true })
  expect(hold).toBe(LAST_STEP_MIN_HOLD_MS)
  const audioEnd = 20_000
  const stepStart = audioEnd - 2000
  const afterHold = stepStart + 2000 + hold
  expect(afterHold + tailWaitMs(afterHold, audioEnd) - audioEnd).toBeLessThanOrEqual(TAIL_MS + LAST_STEP_MIN_HOLD_MS)
  expect(stepHoldMs({ holdMs: 2500, defaultHoldMs: 1200, spokenRemainingMs: 400, last: false })).toBe(2500)
  expect(tailWaitMs(30_000, audioEnd)).toBe(0)
})

test("a video far longer than its script, or over two minutes, fails", () => {
  expect(durationProblem(40_000, 30_000)).toBeNull()
  expect(durationProblem(70_000, 30_000)).toContain("stalled")
  expect(durationProblem(125_000, 90_000)).toContain("120 s")
})
