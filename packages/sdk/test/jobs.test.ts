import { expect, test } from "bun:test"
import { jobRunState } from "../src/jobs"

const base = { registered: true, stale: false, minutesSince: 5 as number | null }
const run = (ok: boolean | null) => ({ startedAt: "x", finishedAt: null, ok, counts: {}, error: null })

test("a run that never finished is running at first, then interrupted, never ok", () => {
  expect(jobRunState({ ...base, lastRun: run(null) })).toBe("running")
  expect(jobRunState({ ...base, minutesSince: 150, lastRun: run(null) })).toBe("interrupted")
  expect(jobRunState({ ...base, lastRun: run(true) })).toBe("ok")
  expect(jobRunState({ ...base, lastRun: run(true), stale: true })).toBe("stale")
  expect(jobRunState({ ...base, lastRun: run(false) })).toBe("failed")
  expect(jobRunState({ ...base, minutesSince: null, lastRun: null })).toBe("never")
  expect(jobRunState({ ...base, registered: false, minutesSince: null, lastRun: null })).toBe("inactive")
})

test("counts read in french, singular for one, and unknown keys are hidden", async () => {
  const { formatJobCount } = await import("../src/jobs")
  expect(formatJobCount("released", 1)).toBe("1 commande libérée")
  expect(formatJobCount("released", 3)).toBe("3 commandes libérées")
  expect(formatJobCount("whatever", 3)).toBeNull()
})
