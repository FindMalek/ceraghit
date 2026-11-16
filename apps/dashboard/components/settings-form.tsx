"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { DEFAULT_SHIPPING_RATES, type StudioSettings, studioSettingsSchema } from "@workspace/sdk"
import { Button } from "@workspace/ui/components/button"
import { showError } from "@workspace/ui/components/error-banner"
import { Field, FieldError, FieldGroup, FieldLabel, FieldSet } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"
import Link from "next/link"
import { type FormEvent, useState } from "react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { EmailDomainCard } from "@/components/email-domain-card"
import { JobsStatus } from "@/components/jobs-status"
import { LocalizedField } from "@/components/localized-field"
import { ErrorState, LoadingRows } from "@/components/query-state"
import { ShippingRatesEditor } from "@/components/shipping-rates-editor"
import { StorageUsage } from "@/components/storage-usage"
import { PHONE } from "@/lib/contact"
import { errorMessage } from "@/lib/errors"
import { fromLocalizedDraft, type LocalizedDraft, toLocalizedDraft } from "@/lib/localized"
import { draftToRates, type RatesDraft, type RatesErrors, ratesToDraft } from "@/lib/shipping-draft"

const INSTAGRAM = /^@?[A-Za-z0-9._]{1,30}$/

function SettingsFormBody({ settings }: { settings: StudioSettings }) {
  const queryClient = useQueryClient()
  const [whatsapp, setWhatsapp] = useState(settings.whatsapp ?? "")
  const [instagram, setInstagram] = useState(settings.instagram ?? "")
  const [rates, setRates] = useState<RatesDraft>(ratesToDraft(settings.shippingRates))
  const [rateErrors, setRateErrors] = useState<RatesErrors>({})
  const [resetting, setResetting] = useState(false)
  const [note, setNote] = useState<LocalizedDraft>(toLocalizedDraft(settings.shippingNote))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = useMutation(
    orpc.admin.settings.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.admin.settings.key() })
      },
      onError: (error) => showError(errorMessage(error)),
    }),
  )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found: Record<string, string> = {}
    if (whatsapp.trim() && !PHONE.test(whatsapp.trim())) found.whatsapp = "Ce numéro n'est pas valide."
    if (instagram.trim() && !INSTAGRAM.test(instagram.trim()))
      found.instagram = "Utilisez seulement lettres, chiffres, points et tirets bas."
    const { rates: shippingRates, errors: ratesFound } = draftToRates(rates)
    setRateErrors(ratesFound)
    const parsed = studioSettingsSchema.safeParse({
      whatsapp: whatsapp.trim() || null,
      instagram: instagram.trim() || null,
      shippingRates,
      shippingNote: fromLocalizedDraft(note, true),
    })
    if (!parsed.success && shippingRates) found.note = "Le français est obligatoire si vous écrivez une note."
    setErrors(found)
    if (Object.keys(found).length > 0 || Object.keys(ratesFound).length > 0 || !parsed.success) {
      showError("Certains champs sont à corriger.")
      return
    }
    save.mutate(parsed.data)
  }

  return (
    <form onSubmit={submit} className="flex min-h-full flex-col">
      <FieldGroup className="gap-8 px-4 py-6 md:max-w-4xl md:px-6">
        <EmailDomainCard />
        <StorageUsage />
        <JobsStatus />
        <p className="text-muted-foreground text-sm">
          Email, téléphones et compte bancaire :{" "}
          <Link href="/settings/profile" className="text-foreground underline underline-offset-4">
            Profil de l'atelier
          </Link>
        </p>
        <FieldSet>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="whatsapp">WhatsApp</FieldLabel>
              <Input
                id="whatsapp"
                className="h-11"
                inputMode="tel"
                aria-invalid={Boolean(errors.whatsapp)}
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
              />
              {errors.whatsapp && <FieldError>{errors.whatsapp}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="instagram">Instagram</FieldLabel>
              <Input
                id="instagram"
                className="h-11"
                aria-invalid={Boolean(errors.instagram)}
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="@ceraghit"
              />
              {errors.instagram && <FieldError>{errors.instagram}</FieldError>}
            </Field>
          </div>
        </FieldSet>
        <ShippingRatesEditor draft={rates} errors={rateErrors} onChange={setRates} onReset={() => setResetting(true)} />

        <FieldSet>
          <LocalizedField
            id="ship-note"
            label="Note de livraison"
            value={note}
            onChange={setNote}
            error={errors.note}
            hint="Affichée au moment de payer, par exemple les délais."
            translateField="settings.shippingNote"
          />
        </FieldSet>
        {(Object.keys(errors).length > 0 || Object.keys(rateErrors).length > 0) && (
          <FieldError>Certains champs sont à corriger.</FieldError>
        )}
      </FieldGroup>
      <ConfirmDialog
        open={resetting}
        onOpenChange={setResetting}
        title="Remettre les valeurs par défaut ?"
        description="La grille de livraison actuelle sera remplacée par les estimations de départ. Rien n'est enregistré avant de cliquer sur Enregistrer."
        confirmLabel="Remettre"
        onConfirm={() => {
          setRates(ratesToDraft(DEFAULT_SHIPPING_RATES))
          setRateErrors({})
        }}
      />
      <div className="sticky bottom-0 z-10 mt-auto flex justify-end border-t bg-background/95 px-4 py-3 backdrop-blur md:px-6">
        <Button type="submit" className="h-11 min-w-40" disabled={save.isPending}>
          {save.isPending && <Spinner />}
          Enregistrer
        </Button>
      </div>
    </form>
  )
}

export function SettingsForm() {
  const settings = useQuery(orpc.admin.settings.get.queryOptions())
  if (settings.isPending) {
    return (
      <div className="px-4 py-6 md:px-6">
        <LoadingRows rows={4} />
      </div>
    )
  }
  if (settings.isError) {
    return (
      <div className="p-4 md:p-6">
        <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
      </div>
    )
  }
  return <SettingsFormBody settings={settings.data} />
}
