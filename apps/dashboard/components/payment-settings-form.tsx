"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import {
  type HoldSettings,
  type PaymentMethodFlags,
  type PayoneerSettings,
  validatePaymentSettings,
} from "@workspace/sdk"
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
import { RadioGroup, RadioGroupItem } from "@workspace/ui/components/radio-group"
import { Spinner } from "@workspace/ui/components/spinner"
import { Switch } from "@workspace/ui/components/switch"
import { type FormEvent, useState } from "react"
import { KonnectKeysCard } from "@/components/konnect-keys-card"
import { LocalizedField } from "@/components/localized-field"
import { ErrorState, LoadingRows } from "@/components/query-state"
import { errorMessage } from "@/lib/errors"
import { fromLocalizedDraft, type LocalizedDraft, toLocalizedDraft } from "@/lib/localized"

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
  {
    key: "payoneer",
    title: "Payoneer",
    description: "Clients hors de Tunisie, en euros. Vous confirmez le paiement à réception.",
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
  initialPayoneer,
  initialHolds,
  gatewayReady,
  production,
}: {
  initial: PaymentMethodFlags
  initialPayoneer: PayoneerSettings
  initialHolds: HoldSettings
  gatewayReady: boolean
  production: boolean
}) {
  const queryClient = useQueryClient()
  const [methods, setMethods] = useState(initial)
  const [holds, setHolds] = useState(initialHolds)
  const [payoneer, setPayoneer] = useState(initialPayoneer)
  const [payoneerNote, setPayoneerNote] = useState<LocalizedDraft>(toLocalizedDraft(initialPayoneer.note))
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
    const settings = {
      methods: { ...methods, online: methods.online && gatewayReady },
      payoneer: {
        ...payoneer,
        staticLink: payoneer.staticLink?.trim() || null,
        receiverEmail: payoneer.receiverEmail?.trim() || null,
        note: fromLocalizedDraft(payoneerNote, true),
      },
      holds,
    }
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
        {methods.payoneer && (
          <section className="flex flex-col gap-4 rounded-lg border bg-card p-4">
            <h2 className="font-heading text-2xl">Payoneer</h2>
            <RadioGroup
              value={payoneer.mode}
              onValueChange={(mode) => {
                setPayoneer((p) => ({ ...p, mode: mode as PayoneerSettings["mode"] }))
                setSaved(false)
                setError(null)
              }}
            >
              <Field orientation="horizontal">
                <RadioGroupItem id="payoneer-per-order" value="per_order" />
                <FieldLabel htmlFor="payoneer-per-order">Un lien par commande (recommandé)</FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <RadioGroupItem id="payoneer-static" value="static" />
                <FieldLabel htmlFor="payoneer-static">Un lien unique pour tous</FieldLabel>
              </Field>
            </RadioGroup>
            {payoneer.mode === "static" && (
              <Field>
                <FieldLabel htmlFor="payoneer-link">Lien Payoneer</FieldLabel>
                <Input
                  id="payoneer-link"
                  type="url"
                  dir="ltr"
                  className="h-11"
                  placeholder="https://link.payoneer.com/..."
                  value={payoneer.staticLink ?? ""}
                  onChange={(e) => {
                    setPayoneer((p) => ({ ...p, staticLink: e.target.value }))
                    setSaved(false)
                    setError(null)
                  }}
                />
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="payoneer-email">Email Payoneer de réception (facultatif)</FieldLabel>
              <Input
                id="payoneer-email"
                type="email"
                dir="ltr"
                className="h-11"
                value={payoneer.receiverEmail ?? ""}
                onChange={(e) => {
                  setPayoneer((p) => ({ ...p, receiverEmail: e.target.value }))
                  setSaved(false)
                  setError(null)
                }}
              />
            </Field>
            <LocalizedField
              id="payoneer-note"
              label="Instructions pour le client (facultatif)"
              value={payoneerNote}
              multiline
              onChange={(value) => {
                setPayoneerNote(value)
                setSaved(false)
                setError(null)
              }}
            />
          </section>
        )}
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
    <>
      <KonnectKeysCard production={appEnv === "production"} />
      <PaymentSettingsBody
        key={String(gatewayReady)}
        initial={settings.methods}
        initialPayoneer={settings.payoneer}
        initialHolds={settings.holds}
        gatewayReady={gatewayReady}
        production={appEnv === "production"}
      />
    </>
  )
}
