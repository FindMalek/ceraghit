import type { SetupStatus } from "@workspace/sdk"

export const ONBOARDING_STEPS = ["welcome", "owner", "profile", "bank", "shipping", "integrations", "done"] as const
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

type RequiredStep = "owner" | "profile" | "bank" | "shipping"
const REQUIRED: RequiredStep[] = ["owner", "profile", "bank", "shipping"]

export const isOnboardingStep = (value: string | undefined): value is OnboardingStep =>
  ONBOARDING_STEPS.includes(value as OnboardingStep)

/** The first required step still open, or the optional integrations once every required one is done. */
export function firstOpenStep(setup: Pick<SetupStatus, "steps">): OnboardingStep {
  const open = REQUIRED.find((id) => !setup.steps.find((s) => s.id === id)?.done)
  return open ?? "integrations"
}

/** Where the wizard opens without a `?step`: the welcome screen on a blank start, else where the owner stopped. */
export function startStep(setup: Pick<SetupStatus, "steps">): OnboardingStep {
  const untouched = REQUIRED.every((id) => !setup.steps.find((s) => s.id === id)?.done)
  return untouched ? "welcome" : firstOpenStep(setup)
}

export const STEP_LABELS: Record<RequiredStep, string> = {
  owner: "Votre nom",
  profile: "Votre atelier",
  bank: "Compte bancaire",
  shipping: "Frais de livraison",
}
