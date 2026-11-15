import type { OptionalSetupStepId, SetupStepId } from "@workspace/sdk"
import { OPTIONAL_STEP_UI } from "@/components/onboarding/optional-steps"

/** Where the owner goes to finish a step; null when the optional page does not exist yet. */
export function setupStepHref(id: SetupStepId): string | null {
  if (id === "owner" || id === "profile" || id === "bank") return `/settings/profile#${id}`
  if (id === "shipping") return "/shipping"
  return OPTIONAL_STEP_UI[id as OptionalSetupStepId].href
}
