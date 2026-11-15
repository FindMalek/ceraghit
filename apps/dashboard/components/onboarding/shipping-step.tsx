"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { DEFAULT_SHIPPING_RATES, formatMoney, type StudioSettings, studioSettingsSchema } from "@workspace/sdk"
import { Button } from "@workspace/ui/components/button"
import { clearError, showError } from "@workspace/ui/components/error-banner"
import { FieldError } from "@workspace/ui/components/field"
import { Spinner } from "@workspace/ui/components/spinner"
import { useState } from "react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { WizardFooter } from "@/components/onboarding/wizard-footer"
import { ErrorState, LoadingRows } from "@/components/query-state"
import { ShippingRatesEditor } from "@/components/shipping-rates-editor"
import { errorMessage } from "@/lib/errors"
import { draftToRates, type RatesDraft, type RatesErrors, ratesToDraft } from "@/lib/shipping-draft"

function ShippingBody({
  settings,
  onBack,
  onDone,
}: {
  settings: StudioSettings
  onBack: () => void
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [draft, setDraft] = useState<RatesDraft>(ratesToDraft(settings.shippingRates))
  const [errors, setErrors] = useState<RatesErrors>({})

  const confirm = useMutation(
    orpc.admin.setup.confirmShipping.mutationOptions({
      onSuccess: () => {
        clearError()
        onDone()
      },
      onError: (e) => showError(errorMessage(e)),
    }),
  )
  const save = useMutation(
    orpc.admin.settings.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.admin.settings.key() })
        setEditing(false)
        confirm.mutate(undefined)
      },
      onError: (e) => showError(errorMessage(e)),
    }),
  )

  const saveRates = () => {
    const { rates, errors: found } = draftToRates(draft)
    setErrors(found)
    const parsed = studioSettingsSchema.safeParse({
      whatsapp: settings.whatsapp,
      instagram: settings.instagram,
      shippingNote: settings.shippingNote,
      shippingRates: rates,
    })
    if (Object.keys(found).length > 0 || !parsed.success) {
      showError("Certains champs sont à corriger.")
      return
    }
    save.mutate(parsed.data)
  }

  const busy = confirm.isPending || save.isPending

  if (editing) {
    return (
      <>
        <ShippingRatesEditor draft={draft} errors={errors} onChange={setDraft} onReset={() => setResetting(true)} />
        {Object.keys(errors).length > 0 && <FieldError>Certains champs sont à corriger.</FieldError>}
        <ConfirmDialog
          open={resetting}
          onOpenChange={setResetting}
          title="Remettre les valeurs par défaut ?"
          description="La grille de livraison actuelle sera remplacée par les estimations de départ. Rien n'est enregistré avant de continuer."
          confirmLabel="Remettre"
          onConfirm={() => {
            setDraft(ratesToDraft(DEFAULT_SHIPPING_RATES))
            setErrors({})
          }}
        />
        <WizardFooter>
          <Button type="button" variant="outline" className="h-12 sm:min-w-32" onClick={() => setEditing(false)}>
            Annuler
          </Button>
          <Button type="button" className="h-12 sm:min-w-40" disabled={busy} onClick={saveRates}>
            {busy && <Spinner />}
            Enregistrer et continuer
          </Button>
        </WizardFooter>
      </>
    )
  }

  return (
    <>
      <ul className="flex flex-col gap-3">
        {settings.shippingRates.zones.map((zone) => (
          <li key={zone.id} className="rounded-xl border bg-card p-4">
            <p className="font-medium text-lg">{zone.name}</p>
            <p className="text-muted-foreground">
              À partir de {formatMoney(zone.base.TND, "TND")} ou {formatMoney(zone.base.EUR, "EUR")} pour {zone.baseKg}{" "}
              kg
            </p>
          </li>
        ))}
      </ul>
      <WizardFooter>
        <Button type="button" variant="outline" className="h-12 sm:min-w-32" onClick={onBack}>
          Retour
        </Button>
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <Button type="button" variant="outline" className="h-12" disabled={busy} onClick={() => setEditing(true)}>
            Modifier les tarifs
          </Button>
          <Button type="button" className="h-12 sm:min-w-40" disabled={busy} onClick={() => confirm.mutate(undefined)}>
            {busy && <Spinner />}
            Les tarifs me conviennent
          </Button>
        </div>
      </WizardFooter>
    </>
  )
}

export function ShippingStep({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const settings = useQuery(orpc.admin.settings.get.queryOptions())
  if (settings.isPending) return <LoadingRows rows={3} />
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
  return <ShippingBody settings={settings.data} onBack={onBack} onDone={onDone} />
}
