"use client"

import { CheckCircleIcon, CircleIcon } from "@phosphor-icons/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import type { OptionalSetupStepId, SetupStatus, ShopProfile } from "@workspace/sdk"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { clearError, showError } from "@workspace/ui/components/error-banner"
import { Progress } from "@workspace/ui/components/progress"
import { Spinner } from "@workspace/ui/components/spinner"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { type ReactNode, useEffect, useRef } from "react"
import { OPTIONAL_STEP_UI } from "@/components/onboarding/optional-steps"
import { ShippingStep } from "@/components/onboarding/shipping-step"
import { WizardFooter } from "@/components/onboarding/wizard-footer"
import { BankSection } from "@/components/profile/bank-section"
import { OwnerSection } from "@/components/profile/owner-section"
import { ShopSection } from "@/components/profile/shop-section"
import { errorMessage } from "@/lib/errors"
import { ONBOARDING_STEPS, type OnboardingStep, STEP_LABELS } from "@/lib/onboarding"

const NUMBERED: readonly OnboardingStep[] = ONBOARDING_STEPS.filter((s) => s !== "welcome")

const COPY: Record<OnboardingStep, { title: string; intro?: string }> = {
  welcome: {
    title: "Bienvenue dans votre atelier en ligne",
    intro:
      "Quelques questions pour préparer la boutique. Comptez 10 minutes, vous pouvez vous arrêter et reprendre plus tard.",
  },
  owner: { title: "Comment vous appelez-vous ?", intro: "Ce nom s'affiche dans votre tableau de bord." },
  profile: {
    title: "Votre atelier",
    intro: "Le matricule fiscal figure sur vos factures. Vous le trouverez sur vos papiers de l'administration.",
  },
  bank: {
    title: "Où recevoir les virements ?",
    intro:
      "Ces coordonnées sont envoyées aux clients qui paient par virement. Le compte en euros est facultatif : il sert aux commandes en EUR réglées par virement. Un compte en dollars, facultatif aussi, peut s'afficher à côté.",
  },
  shipping: {
    title: "Frais de livraison",
    intro: "Vérifiez les frais de livraison. Vous pourrez les changer à tout moment dans Livraison.",
  },
  integrations: {
    title: "Pour aller plus loin",
    intro: "Rien d'obligatoire ici. Vous pourrez tout configurer plus tard.",
  },
  done: { title: "Tout est prêt" },
}

const stepHref = (step: OnboardingStep) => `/onboarding?step=${step}`

function OptionalCards({ setup }: { setup: SetupStatus }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const skip = useMutation(
    orpc.admin.setup.skip.mutationOptions({
      onSuccess: () => {
        clearError()
        queryClient.invalidateQueries({ queryKey: orpc.admin.setup.status.key() })
        router.refresh()
      },
      onError: (e) => showError(errorMessage(e)),
    }),
  )
  const optional = setup.steps.filter((s) => !s.required)
  return (
    <ul className="flex flex-col gap-3">
      {optional.map((step) => {
        const ui = OPTIONAL_STEP_UI[step.id as OptionalSetupStepId]
        const status = step.done ? "Configuré" : step.skipped ? "Ignoré" : "À faire plus tard"
        return (
          <li key={step.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium text-lg leading-snug">{ui.title}</p>
              <Badge variant={step.done ? "default" : "secondary"} className="shrink-0">
                {status}
              </Badge>
            </div>
            <p className="text-muted-foreground">{ui.why}</p>
            <div className="flex flex-wrap gap-3">
              {ui.href ? (
                <Button className="h-12" nativeButton={false} render={<Link href={ui.href} />}>
                  Configurer
                </Button>
              ) : (
                <Button className="h-12" disabled>
                  Bientôt disponible
                </Button>
              )}
              {!step.done && !step.skipped && (
                <Button
                  variant="outline"
                  className="h-12"
                  disabled={skip.isPending}
                  onClick={() => skip.mutate({ step: step.id as OptionalSetupStepId })}
                >
                  Plus tard
                </Button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function DoneStep({ setup, onBack }: { setup: SetupStatus; onBack: () => void }) {
  const router = useRouter()
  const finish = useMutation(
    orpc.admin.setup.finish.mutationOptions({
      onSuccess: () => {
        clearError()
        router.replace("/")
        router.refresh()
      },
      onError: (e) => showError(errorMessage(e)),
    }),
  )
  const missing = setup.steps.filter((s) => s.required && !s.done)
  return (
    <>
      <ul className="flex flex-col gap-2">
        {setup.steps.map((step) => {
          const label = step.required
            ? STEP_LABELS[step.id as keyof typeof STEP_LABELS]
            : OPTIONAL_STEP_UI[step.id as OptionalSetupStepId].title
          return (
            <li key={step.id} className="flex min-h-12 items-center gap-3 rounded-lg border bg-card px-4 py-2">
              {step.done ? (
                <CheckCircleIcon weight="fill" className="size-6 shrink-0 text-primary" aria-hidden />
              ) : (
                <CircleIcon className="size-6 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className="flex-1">{label}</span>
              <span className="text-muted-foreground text-sm">
                {step.done ? "Fait" : step.required ? "À compléter" : step.skipped ? "Ignoré" : "Plus tard"}
              </span>
            </li>
          )
        })}
      </ul>
      {missing.length > 0 && (
        <div role="alert" className="mt-6 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="font-medium">Il reste à compléter :</p>
          <ul className="mt-2 flex flex-col">
            {missing.map((step) => (
              <li key={step.id}>
                <Link
                  href={stepHref(step.id as OnboardingStep)}
                  className="flex min-h-11 items-center underline underline-offset-4"
                >
                  {STEP_LABELS[step.id as keyof typeof STEP_LABELS]}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <WizardFooter>
        <Button type="button" variant="outline" className="h-12 sm:min-w-32" onClick={onBack}>
          Retour
        </Button>
        <Button
          type="button"
          className="h-12 sm:min-w-56"
          disabled={!setup.requiredDone || finish.isPending}
          onClick={() => finish.mutate(undefined)}
        >
          {finish.isPending && <Spinner />}
          Ouvrir mon tableau de bord
        </Button>
      </WizardFooter>
    </>
  )
}

export function OnboardingWizard({
  step,
  owner,
  shop,
  setup,
}: {
  step: OnboardingStep
  owner: { name: string }
  shop: ShopProfile
  setup: SetupStatus
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
  }, [])

  const index = ONBOARDING_STEPS.indexOf(step)
  const go = (to: OnboardingStep) => router.push(stepHref(to))
  const next = () => {
    queryClient.invalidateQueries({ queryKey: orpc.admin.setup.status.key() })
    go(ONBOARDING_STEPS[index + 1] ?? "done")
  }
  const back = () => go(ONBOARDING_STEPS[Math.max(index - 1, 0)] ?? "welcome")
  const number = NUMBERED.indexOf(step) + 1

  const body: Record<OnboardingStep, ReactNode> = {
    welcome: (
      <WizardFooter>
        <Button type="button" className="h-12 sm:ml-auto sm:min-w-48" onClick={next}>
          Commencer
        </Button>
      </WizardFooter>
    ),
    owner: <OwnerSection initial={owner} onSaved={next} wizard={{ onBack: back }} />,
    profile: <ShopSection initial={shop} onSaved={next} wizard={{ onBack: back }} />,
    bank: <BankSection initial={shop} onSaved={next} wizard={{ onBack: back }} />,
    shipping: <ShippingStep onBack={back} onDone={next} />,
    integrations: (
      <>
        <OptionalCards setup={setup} />
        <WizardFooter>
          <Button type="button" variant="outline" className="h-12 sm:min-w-32" onClick={back}>
            Retour
          </Button>
          <Button type="button" className="h-12 sm:min-w-40" onClick={next}>
            Continuer
          </Button>
        </WizardFooter>
      </>
    ),
    done: <DoneStep setup={setup} onBack={back} />,
  }

  return (
    <div className="flex flex-col gap-6">
      {number > 0 && (
        <Progress locale="fr" value={(number / NUMBERED.length) * 100} aria-label="Avancement">
          <p aria-live="polite" className="text-muted-foreground text-sm">
            Étape {number} sur {NUMBERED.length}
          </p>
        </Progress>
      )}
      <div className="flex flex-col gap-2">
        <h1
          key={step}
          ref={(el) => {
            if (mounted.current) el?.focus()
          }}
          tabIndex={-1}
          className="font-heading text-3xl leading-tight outline-none"
        >
          {COPY[step].title}
        </h1>
        {COPY[step].intro && <p className="text-lg text-muted-foreground">{COPY[step].intro}</p>}
      </div>
      {body[step]}
    </div>
  )
}
