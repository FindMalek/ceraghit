import type { Page } from "@playwright/test"

/** A recording that hangs must fail fast with the step it hung on, not run for ten minutes. */
export const ACTION_TIMEOUT_MS = 10_000
export const NAVIGATION_TIMEOUT_MS = 15_000
export const VIDEO_DEADLINE_MS = 180_000
export const MAX_VIDEO_MS = 120_000
/** Quiet time kept after the last narration, so the picture does not outlive the voice. */
export const TAIL_MS = 1000
/** The shortest hold on the last step, so the line is not cut. */
export const LAST_STEP_MIN_HOLD_MS = 600

export function applyTimeouts(page: Page, ms: { action?: number; navigation?: number } = {}): void {
  page.setDefaultTimeout(ms.action ?? ACTION_TIMEOUT_MS)
  page.setDefaultNavigationTimeout(ms.navigation ?? NAVIGATION_TIMEOUT_MS)
}

/** Rejects with `label()` (read at the deadline, so it names the step that hung) when `work` takes longer than `ms`. */
export async function withDeadline<T>(work: Promise<T>, ms: number, label: () => string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label()} did not finish within ${ms} ms`)), ms)
  })
  try {
    return await Promise.race([work, deadline])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * How long a step keeps the screen after its action. A narrated last step only waits for its voice (the closing wait
 * adds the tail); every other step keeps its hold.
 */
export function stepHoldMs(opts: {
  holdMs?: number
  defaultHoldMs: number
  spokenRemainingMs: number
  lastNarrated: boolean
}): number {
  if (opts.lastNarrated) return Math.max(opts.spokenRemainingMs, LAST_STEP_MIN_HOLD_MS)
  return Math.max(opts.holdMs ?? opts.defaultHoldMs, opts.spokenRemainingMs)
}

/**
 * Wait after the last step. With a voice the video ends `TAIL_MS` after the last narration; without any audio the
 * closing still stays, so the last frame and caption are not cut.
 */
export function closingWaitMs(nowMs: number, lastAudioEndMs: number | null, stillMs: number): number {
  if (lastAudioEndMs === null) return stillMs
  return Math.max(0, lastAudioEndMs + TAIL_MS - nowMs)
}

/**
 * Runs `work` under a deadline. On a hang or an error `cleanup` runs first (kill ffmpeg, close the browser, delete the
 * partial files) and the original error is thrown, so nothing is left running.
 */
export async function runGuarded<T>(
  work: () => Promise<T>,
  opts: { ms: number; label: () => string; cleanup: () => Promise<void> },
): Promise<T> {
  try {
    return await withDeadline(work(), opts.ms, opts.label)
  } catch (error) {
    await opts.cleanup().catch(() => {})
    throw error
  }
}

/** A message when the finished video is far longer than its script says, which means something stalled. */
export function durationProblem(durationMs: number, expectedMs: number): string | null {
  if (durationMs > MAX_VIDEO_MS)
    return `the video lasts ${Math.round(durationMs / 1000)} s, over the ${MAX_VIDEO_MS / 1000} s limit`
  if (durationMs > expectedMs * 2)
    return `the video lasts ${Math.round(durationMs / 1000)} s but its steps add up to ${Math.round(expectedMs / 1000)} s, something stalled`
  return null
}
