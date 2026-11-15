"use client"

import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { FieldGroup } from "@workspace/ui/components/field"
import { Spinner } from "@workspace/ui/components/spinner"
import type { FormEvent, ReactNode } from "react"

/** One save button per card, so the onboarding can show a single section as a step. */
export function SectionCard({
  title,
  description,
  pending,
  saved,
  onSubmit,
  children,
}: {
  title: string
  description?: string
  pending: boolean
  saved: boolean
  onSubmit: () => void
  children: ReactNode
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit()
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
