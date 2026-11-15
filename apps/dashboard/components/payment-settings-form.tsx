"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { type PaymentMethodFlags, validatePaymentSettings } from "@workspace/sdk"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Spinner } from "@workspace/ui/components/spinner"
import { Switch } from "@workspace/ui/components/switch"
import { type FormEvent, useState } from "react"
import { ErrorState, LoadingRows } from "@/components/query-state"
import { errorMessage } from "@/lib/errors"

const METHODS: { key: keyof PaymentMethodFlags; title: string; description: string }[] = [
  {
    key: "online",
    title: "Carte bancaire (Konnect)",
    description: "Le client paie en ligne par carte ou e-DINAR. Le paiement est confirmé automatiquement.",
  },
  {
    key: "cod",
    title: "Paiement à la livraison",
    description: "Tunisie uniquement. Le client paie en espèces au livreur.",
  },
  {
    key: "transfer",
    title: "Virement bancaire",
    description: "Clients hors de Tunisie. Vous confirmez le paiement quand l'argent arrive.",
  },
]

function PaymentSettingsBody({
  initial,
  gatewayReady,
  production,
}: {
  initial: PaymentMethodFlags
  gatewayReady: boolean
  production: boolean
}) {
  const queryClient = useQueryClient()
  const [methods, setMethods] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const save = useMutation(
    orpc.admin.settings.savePayments.mutationOptions({
      onSuccess: () => {
        setSaved(true)
        queryClient.invalidateQueries({ queryKey: orpc.admin.settings.key() })
      },
      onError: (e) => setError(errorMessage(e)),
    }),
  )

  const toggle = (key: keyof PaymentMethodFlags, on: boolean) => {
    setMethods((m) => ({ ...m, [key]: on }))
    setSaved(false)
    setError(null)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const settings = { methods: { ...methods, online: methods.online && gatewayReady } }
    const invalid = validatePaymentSettings(settings, gatewayReady)
    setError(invalid)
    setSaved(false)
    if (!invalid) save.mutate(settings)
  }

  return (
    <form onSubmit={submit} className="flex min-h-full flex-col">
      <FieldGroup className="gap-4 px-4 py-6 md:max-w-3xl md:px-6">
        <div>
          <Badge variant={production ? "default" : "secondary"}>{production ? "Production" : "Mode test (démo)"}</Badge>
        </div>
        {METHODS.map(({ key, title, description }) => {
          const locked = key === "online" && !gatewayReady
          return (
            <Field key={key} orientation="horizontal" className="rounded-lg border bg-card p-4">
              <FieldContent>
                <FieldLabel htmlFor={`method-${key}`}>{title}</FieldLabel>
                <FieldDescription>{description}</FieldDescription>
                {locked && (
                  <FieldDescription className="text-foreground">Ajoutez d'abord vos clés Konnect.</FieldDescription>
                )}
              </FieldContent>
              <Switch
                id={`method-${key}`}
                checked={methods[key] && !locked}
                disabled={locked}
                onCheckedChange={(on) => toggle(key, on)}
              />
            </Field>
          )
        })}
        {error && <FieldError>{error}</FieldError>}
        {saved && (
          <p role="status" className="text-primary text-sm">
            Moyens de paiement enregistrés.
          </p>
        )}
      </FieldGroup>
      <div className="sticky bottom-0 z-10 mt-auto flex justify-end border-t bg-background/95 px-4 py-3 backdrop-blur md:px-6">
        <Button type="submit" className="h-11 min-w-40" disabled={save.isPending}>
          {save.isPending && <Spinner />}
          Enregistrer
        </Button>
      </div>
    </form>
  )
}

export function PaymentSettingsForm() {
  const payments = useQuery(orpc.admin.settings.getPayments.queryOptions())
  if (payments.isPending) {
    return (
      <div className="px-4 py-6 md:px-6">
        <LoadingRows rows={3} />
      </div>
    )
  }
  if (payments.isError) {
    return (
      <div className="p-4 md:p-6">
        <ErrorState error={payments.error} onRetry={() => payments.refetch()} />
      </div>
    )
  }
  const { settings, gatewayReady, appEnv } = payments.data
  return (
    <PaymentSettingsBody initial={settings.methods} gatewayReady={gatewayReady} production={appEnv === "production"} />
  )
}
