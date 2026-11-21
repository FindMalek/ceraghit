import type { Page, TestInfo } from "@playwright/test"
import { step } from "./screenshot"

export interface JourneyStepTiming {
  caption: string
  startMs: number
  endMs: number
}

export interface Journey {
  /** A step of a tutorial video: `captionFr` is the caption shown on screen, `fn` does and asserts it. */
  step: (captionFr: string, fn: () => Promise<void>, target?: Page) => Promise<void>
  timings: JourneyStepTiming[]
}

/** Pacing only exists while recording a video; the specs themselves never wait. */
export function recording(): boolean {
  return process.env.JOURNEY_RECORD === "1" && !process.env.CI
}

const HOLD_MS = Number(process.env.JOURNEY_HOLD_MS ?? 1200)

export function createJourney(page: Page, testInfo: TestInfo): Journey {
  const timings: JourneyStepTiming[] = []
  const started = Date.now()
  return {
    timings,
    async step(captionFr, fn, target) {
      const startMs = Date.now() - started
      await step(target ?? page, testInfo, captionFr, fn)
      if (recording()) await (target ?? page).waitForTimeout(HOLD_MS)
      timings.push({ caption: captionFr, startMs, endMs: Date.now() - started })
    },
  }
}

export async function attachTimings(journey: Journey, testInfo: TestInfo): Promise<void> {
  await testInfo.attach("journey-steps.json", {
    body: JSON.stringify(journey.timings, null, 2),
    contentType: "application/json",
  })
}
