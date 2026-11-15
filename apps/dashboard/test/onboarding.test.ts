import { expect, test } from "bun:test"
import { SETUP_OPTIONAL_STEPS, SETUP_REQUIRED_STEPS, type SetupStatus } from "@workspace/sdk"
import { firstOpenStep, startStep } from "../lib/onboarding"

const status = (doneIds: string[]): Pick<SetupStatus, "steps"> => ({
  steps: [...SETUP_REQUIRED_STEPS, ...SETUP_OPTIONAL_STEPS].map((id) => ({
    id,
    required: (SETUP_REQUIRED_STEPS as readonly string[]).includes(id),
    done: doneIds.includes(id),
    skipped: false,
    missing: [],
  })),
})

test("resumes at the first required step that is not done", () => {
  expect(firstOpenStep(status([]))).toBe("owner")
  expect(firstOpenStep(status(["owner"]))).toBe("profile")
  expect(firstOpenStep(status(["owner", "profile", "shipping"]))).toBe("bank")
  expect(firstOpenStep(status(["owner", "profile", "bank", "shipping"]))).toBe("integrations")
})

test("opens on the welcome screen only when nothing is done yet", () => {
  expect(startStep(status([]))).toBe("welcome")
  expect(startStep(status(["owner"]))).toBe("profile")
})
