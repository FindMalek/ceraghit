"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import type { OptionalSetupStepId, SetupStepId } from "@workspace/sdk"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { clearError, showError } from "@workspace/ui/components/error-banner"
import { Progress } from "@workspace/ui/components/progress"
import Link from "next/link"
import { OPTIONAL_STEP_UI } from "@/components/onboarding/optional-steps"
import { errorMessage } from "@/lib/errors"
import { STEP_LABELS } from "@/lib/onboarding"
import { setupStepHref } from "@/lib/setup-links"
import { useSetupStatus } from "@/lib/use-setup-status"

const row = "flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm outline-none"

const stepTitle = (id: SetupStepId) =>
  id in STEP_LABELS ? STEP_LABELS[id as keyof typeof STEP_LABELS] : OPTIONAL_STEP_UI[id as OptionalSetupStepId].title

/** What is left of the setup, with a link to each open step. Gone once everything is done. */
export function SetupProgressCard() {
  const status = useSetupStatus()
  const queryClient = useQueryClient()
  const skip = useMutation(
    orpc.admin.setup.skip.mutationOptions({
      onSuccess: () => {
        clearError()
        queryClient.invalidateQueries({ queryKey: orpc.admin.setup.status.key() })
      },
      onError: (e) => showError(errorMessage(e)),
    }),
  )
  const setup = status.data
  if (!setup || setup.remaining === 0) return null
  const open = setup.steps.filter((s) => !s.done && !s.skipped).sort((a, b) => Number(b.required) - Number(a.required))
  return (
    <Card className="frame bg-card/70">
      <CardHeader className="gap-1">
        <CardTitle className="font-heading text-lg">Terminer la configuration</CardTitle>
        <CardDescription>
          {setup.done} sur {setup.total} étapes
        </CardDescription>
        <Progress value={(setup.done / setup.total) * 100} aria-label="Avancement de la configuration" />
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1">
          {open.map((step) => {
            const href = setupStepHref(step.id)
            return (
              <li key={step.id} className="flex items-center gap-1">
                {href ? (
                  <Link
                    href={href}
                    className={`${row} flex-1 hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50`}
                  >
                    <span className="flex-1">{stepTitle(step.id)}</span>
                    {step.required && <Badge variant="secondary">Obligatoire</Badge>}
                  </Link>
                ) : (
                  <span className={`${row} flex-1 text-muted-foreground`}>
                    <span className="flex-1">{stepTitle(step.id)}</span>
                    <span className="text-xs">Bientôt disponible</span>
                  </span>
                )}
                {!step.required && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11"
                    aria-label={`Ignorer ${stepTitle(step.id)}`}
                    disabled={skip.isPending}
                    onClick={() => skip.mutate({ step: step.id as OptionalSetupStepId })}
                  >
                    Ignorer
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
