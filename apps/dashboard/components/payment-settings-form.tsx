"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { type HoldSettings, type PaymentMethodFlags, validatePaymentSettings } from "@workspace/sdk"
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
import { Input } from "@workspace/ui/components/input"
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

const parseDays = (value: string): number | null => (value.trim() === "" ? null : Number(value))

const HOLD_FIELDS: { key: keyof HoldSettings; label: string; hint: string }[] = [
  { key: "transferDays", label: "Virement : annuler après (jours)", hint: "Vide = jamais." },
  { key: "codDays", label: "Paiement à la livraison : annuler après (jours)", hint: "Vide = jamais." },
  { key: "warnDays", label: "Prévenir (jours avant)", hint: "Un badge « Expire le » apparaît dans les commandes." },
]

function PaymentSettingsBody({
  initial,
  initialHolds,
  gatewayReady,
  production,
}: {
  initial: PaymentMethodFlags
  initialHolds: HoldSettings
  gatewayReady: boolean
  production: boolean
}) {
  const queryClient = useQueryClient()
  const [methods, setMethods] = useState(initial)
  const [holds, setHolds] = useState(initialHolds)
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
    const settings = { methods: { ...methods, online: methods.online && gatewayReady }, holds }
    const days = [holds.transferDays, holds.codDays].filter((d): d is number => d !== null)
    const badDays = days.some((d) => !Number.isInteger(d) || d < 1 || d > 60)
    const badWarn = !Number.isInteger(holds.warnDays) || holds.warnDays < 0 || holds.warnDays > 14
    const invalid =
      validatePaymentSettings(settings, gatewayReady) ??
      (badDays ? "Le délai doit être de 1 à 60 jours." : badWarn ? "Le préavis doit être de 0 à 14 jours." : null)
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
                  <FieldDescription className="text-foreground">
                    {initial.online
                      ? "Carte enregistrée mais clés Konnect absentes : livraison et virement sont proposés à la place."
                      : "Ajoutez d'abord vos clés Konnect."}
                  </FieldDescription>
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
        <section className="flex flex-col gap-4 rounded-lg border bg-card p-4">
          <div>
            <h2 className="font-heading text-2xl">Délai de paiement</h2>
            <FieldDescription>
              Une commande non payée bloque ses pièces. Passé ce délai, elle est annulée automatiquement et le client
              est prévenu. Un paiement reçu après l'annulation n'est pas rattaché : la commande reste visible dans
              l'historique, mais les pièces peuvent avoir été revendues.
            </FieldDescription>
          </div>
          {HOLD_FIELDS.map(({ key, label, hint }) => (
            <Field key={key}>
              <FieldLabel htmlFor={`hold-${key}`}>{label}</FieldLabel>
              <Input
                id={`hold-${key}`}
                type="number"
                inputMode="numeric"
                min={key === "warnDays" ? 0 : 1}
                max={key === "warnDays" ? 14 : 60}
                className="h-11 max-w-32"
                value={holds[key] ?? ""}
                onChange={(e) => {
                  setHolds((h) => ({
                    ...h,
                    [key]: key === "warnDays" ? Number(e.target.value) : parseDays(e.target.value),
                  }))
                  setSaved(false)
                  setError(null)
                }}
              />
              <FieldDescription>{hint}</FieldDescription>
            </Field>
          ))}
        </section>
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
    <PaymentSettingsBody
      initial={settings.methods}
      initialHolds={settings.holds}
      gatewayReady={gatewayReady}
      production={appEnv === "production"}
    />
  )
}
