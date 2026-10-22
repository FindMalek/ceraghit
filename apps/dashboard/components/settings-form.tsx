"use client"

import { PlusIcon, TrashIcon } from "@phosphor-icons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { errorMessage } from "@workspace/orpc/errors"
import { orpc } from "@workspace/orpc/react"
import { DEFAULT_SHIPPING_RATES, type StudioSettings, studioSettingsSchema } from "@workspace/sdk"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"
import { type FormEvent, useState } from "react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { LocalizedField } from "@/components/localized-field"
import { ErrorState, LoadingRows } from "@/components/query-state"
import { ShippingRatesEditor } from "@/components/shipping-rates-editor"
import { fromLocalizedDraft, type LocalizedDraft, toLocalizedDraft } from "@/lib/localized"
import { draftToRates, type RatesDraft, type RatesErrors, ratesToDraft } from "@/lib/shipping-draft"

function SettingsFormBody({ settings }: { settings: StudioSettings }) {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState(settings.contactEmail)
  const [phones, setPhones] = useState(settings.phones.length ? settings.phones : [""])
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
        toast.success("Réglages enregistrés.")
      },
      onError: (error) => toast.error(errorMessage(error)),
    }),
  )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found: Record<string, string> = {}
    const { rates: shippingRates, errors: ratesFound } = draftToRates(rates)
    setRateErrors(ratesFound)
    const parsed = studioSettingsSchema.safeParse({
      contactEmail: email.trim(),
      phones: phones.map((p) => p.trim()).filter(Boolean),
      whatsapp: whatsapp.trim() || null,
      instagram: instagram.trim() || null,
      shippingRates,
      shippingNote: fromLocalizedDraft(note, true),
    })
    if (!parsed.success && shippingRates) found.note = "Le français est obligatoire si vous écrivez une note."
    setErrors(found)
    if (Object.keys(found).length > 0 || Object.keys(ratesFound).length > 0 || !parsed.success) {
      toast.error("Certains champs sont à corriger.")
      return
    }
    save.mutate(parsed.data)
  }

  return (
    <form onSubmit={submit} className="flex min-h-full flex-col">
      <FieldGroup className="gap-8 px-4 py-6 md:max-w-4xl md:px-6">
        <FieldSet>
          <Field>
            <FieldLabel htmlFor="email">Email de contact</FieldLabel>
            <Input id="email" type="email" className="h-11" value={email} onChange={(e) => setEmail(e.target.value)} />
            <FieldDescription>
              Affiché sur le site. Vous répondez aux demandes depuis votre propre boîte mail.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Téléphones</FieldLabel>
            <div className="flex flex-col gap-2">
              {phones.map((phone, index) => (
                <div key={`phone-${index}`} className="flex gap-2">
                  <Input
                    className="h-11 tabular-nums"
                    inputMode="tel"
                    aria-label={`Téléphone ${index + 1}`}
                    value={phone}
                    onChange={(e) => setPhones((list) => list.map((p, i) => (i === index ? e.target.value : p)))}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    aria-label="Retirer"
                    onClick={() => setPhones((list) => list.filter((_, i) => i !== index))}
                  >
                    <TrashIcon />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full sm:w-fit"
                onClick={() => setPhones((list) => [...list, ""])}
              >
                <PlusIcon /> Ajouter un numéro
              </Button>
            </div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="whatsapp">WhatsApp</FieldLabel>
              <Input
                id="whatsapp"
                className="h-11"
                inputMode="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="instagram">Instagram</FieldLabel>
              <Input
                id="instagram"
                className="h-11"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="@ceraghit"
              />
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
