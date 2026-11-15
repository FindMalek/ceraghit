import type { Metadata } from "next"
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard"
import { admin } from "@/lib/api"
import { isOnboardingStep, startStep } from "@/lib/onboarding"

export const metadata: Metadata = { title: "Bienvenue" }

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const [{ step }, { owner, shop }, setup] = await Promise.all([
    searchParams,
    admin((api) => api.profile.get()),
    admin((api) => api.setup.status()),
  ])
  return (
    <OnboardingWizard step={isOnboardingStep(step) ? step : startStep(setup)} owner={owner} shop={shop} setup={setup} />
  )
}
