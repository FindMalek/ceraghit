"use client"

import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { FieldGroup } from "@workspace/ui/components/field"
import { Spinner } from "@workspace/ui/components/spinner"
import type { FormEvent, ReactNode } from "react"
import { WizardFooter } from "@/components/onboarding/wizard-footer"

/** Onboarding mode: no card chrome, the wizard shows the title, and "Continuer" replaces "Enregistrer". */
export interface WizardMode {
  onBack: () => void
}

/** One save button per card, so the onboarding can show a single section as a step. */
export function SectionCard({
  title,
  description,
  pending,
  saved,
  onSubmit,
  wizard,
  children,
}: {
  title: string
  description?: string
  pending: boolean
  saved: boolean
  onSubmit: () => void
  wizard?: WizardMode
  children: ReactNode
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit()
  }
  if (wizard) {
    return (
      <form onSubmit={submit} noValidate>
        <FieldGroup className="gap-6 [&_button[role=combobox]]:h-12 [&_input]:h-12 [&_input]:text-base">
          {children}
        </FieldGroup>
        <WizardFooter>
          <Button type="button" variant="outline" className="h-12 sm:min-w-32" onClick={wizard.onBack}>
            Retour
          </Button>
          <Button type="submit" className="h-12 sm:min-w-40" disabled={pending}>
            {pending && <Spinner />}
            Continuer
          </Button>
        </WizardFooter>
      </form>
    )
  }
  return (
    <Card className="w-full md:max-w-3xl">
      <form onSubmit={submit} noValidate className="flex flex-col gap-(--card-spacing)">
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-5">{children}</FieldGroup>
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
          <p role="status" className="text-muted-foreground text-sm sm:mr-auto">
            {saved ? "Enregistré" : ""}
          </p>
          <Button type="submit" className="h-11 w-full sm:w-auto sm:min-w-40" disabled={pending}>
            {pending && <Spinner />}
            Enregistrer
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
