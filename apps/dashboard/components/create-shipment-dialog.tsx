"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { formatMoney, type ShipmentDraft } from "@workspace/sdk"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { showError } from "@workspace/ui/components/error-banner"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { useEffect, useState } from "react"
import { AddressCheck } from "@/components/address-check"
import { Tone } from "@/components/status-badge"
import { errorMessage } from "@/lib/errors"

const ENVIRONMENT = {
  test: { label: "Test", tone: "warn" },
  live: { label: "Réel", tone: "bad" },
  fake: { label: "Simulé", tone: "quiet" },
} as const

/** So the owner never creates a real parcel by mistake. */
export function EnvironmentChip({ environment }: { environment: keyof typeof ENVIRONMENT }) {
  const { label, tone } = ENVIRONMENT[environment]
  return (
    <span data-testid="shipment-environment">
      <Tone tone={tone}>{label}</Tone>
    </span>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  max,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  max?: number
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        className="h-11"
        type={type}
        inputMode={type === "number" ? "numeric" : undefined}
        maxLength={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

type Form = Pick<ShipmentDraft, "consignee" | "parcel" | "description" | "fragile">

export function CreateShipmentDialog({
  orderId,
  open,
  onOpenChange,
}: {
  orderId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const draft = useQuery({
    ...orpc.admin.shipping.draft.queryOptions({ input: { orderId } }),
    enabled: open,
    gcTime: 0,
  })
  const [form, setForm] = useState<Form | null>(null)
  const [insure, setInsure] = useState(false)

  useEffect(() => {
    if (open && draft.data) {
      const { consignee, parcel, description, fragile } = draft.data
      setForm({ consignee, parcel, description, fragile })
      setInsure(false)
    }
  }, [open, draft.data])

  const create = useMutation(
    orpc.admin.shipping.createShipment.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.admin.orders.key() })
        queryClient.invalidateQueries({ queryKey: orpc.admin.shipping.shipmentOf.key() })
        queryClient.invalidateQueries({ queryKey: orpc.admin.overview.key() })
        onOpenChange(false)
      },
      onError: (error) => showError(errorMessage(error)),
    }),
  )

  const d = draft.data
  const setConsignee = (key: keyof Form["consignee"], value: string) =>
    setForm((f) => (f ? { ...f, consignee: { ...f.consignee, [key]: value } } : f))
  const setParcel = (key: keyof Form["parcel"], value: string) =>
    setForm((f) => (f ? { ...f, parcel: { ...f.parcel, [key]: Number(value.replace(/\D/g, "")) } } : f))

  const submit = () => {
    if (!d || !form) return
    create.mutate({
      orderId,
      ...form,
      insurance: insure ? { amountMinor: d.insuranceSuggestedMinor } : null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Créer l'expédition Aramex</DialogTitle>
          <DialogDescription>
            {d ? `Commande ${d.orderNumber}. ` : ""}Vérifiez le colis et l'adresse avant de confirmer.
          </DialogDescription>
        </DialogHeader>
        {draft.isError && <p role="alert">{errorMessage(draft.error)}</p>}
        {d && form && (
          <div className="flex flex-col gap-4">
            <EnvironmentChip environment={d.environment} />
            {d.blocked && (
              <p role="alert" className="text-destructive text-sm" data-testid="shipment-blocked">
                {d.blocked}
              </p>
            )}
            {d.warnings.map((w) => (
              <p key={w} className="text-sm text-ochre">
                {w}
              </p>
            ))}
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 font-heading text-lg">Destinataire</legend>
              <Field
                id="sh-name"
                label="Nom"
                value={form.consignee.name}
                max={80}
                onChange={(v) => setConsignee("name", v)}
              />
              <Field
                id="sh-phone"
                label="Téléphone"
                value={form.consignee.phone}
                max={30}
                onChange={(v) => setConsignee("phone", v)}
              />
              <Field
                id="sh-line1"
                label="Adresse"
                value={form.consignee.line1}
                max={100}
                onChange={(v) => setConsignee("line1", v)}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  id="sh-city"
                  label="Ville"
                  value={form.consignee.city}
                  max={60}
                  onChange={(v) => setConsignee("city", v)}
                />
                <Field
                  id="sh-postal"
                  label="Code postal"
                  value={form.consignee.postalCode ?? ""}
                  max={10}
                  onChange={(v) => setConsignee("postalCode", v)}
                />
              </div>
              <AddressCheck
                orderId={orderId}
                address={{
                  line1: form.consignee.line1,
                  city: form.consignee.city,
                  ...(form.consignee.postalCode ? { postalCode: form.consignee.postalCode } : {}),
                }}
                onUse={(s) => {
                  setConsignee("line1", s.line1)
                  setConsignee("city", s.city)
                  setConsignee("postalCode", s.postalCode)
                }}
              />
            </fieldset>
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 font-heading text-lg">Colis</legend>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  id="sh-weight"
                  label="Poids (g)"
                  type="number"
                  value={String(form.parcel.weightGrams)}
                  onChange={(v) => setParcel("weightGrams", v)}
                />
                <Field
                  id="sh-pieces"
                  label="Nombre de colis"
                  type="number"
                  value={String(form.parcel.pieces)}
                  onChange={(v) => setParcel("pieces", v)}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field
                  id="sh-length"
                  label="Long. (cm)"
                  type="number"
                  value={String(form.parcel.lengthCm)}
                  onChange={(v) => setParcel("lengthCm", v)}
                />
                <Field
                  id="sh-width"
                  label="Larg. (cm)"
                  type="number"
                  value={String(form.parcel.widthCm)}
                  onChange={(v) => setParcel("widthCm", v)}
                />
                <Field
                  id="sh-height"
                  label="Haut. (cm)"
                  type="number"
                  value={String(form.parcel.heightCm)}
                  onChange={(v) => setParcel("heightCm", v)}
                />
              </div>
              <Field
                id="sh-description"
                label="Description"
                value={form.description}
                max={50}
                onChange={(v) => setForm((f) => (f ? { ...f, description: v } : f))}
              />
              <div className="flex items-center gap-2 text-sm">
                <Checkbox
                  id="sh-fragile"
                  checked={form.fragile}
                  onCheckedChange={(on) => setForm((f) => (f ? { ...f, fragile: on === true } : f))}
                />
                <Label htmlFor="sh-fragile">Fragile</Label>
              </div>
            </fieldset>
            {d.codAmountMinor !== null && (
              <section>
                <h3 className="mb-1 font-heading text-lg">Paiement à la livraison</h3>
                <p className="text-sm" data-testid="shipment-cod">
                  Aramex encaissera {formatMoney(d.codAmountMinor, "TND")} à la livraison.
                </p>
              </section>
            )}
            <section>
              <h3 className="mb-1 font-heading text-lg">Assurance</h3>
              <div className="flex items-center gap-2 text-sm">
                <Checkbox id="sh-insure" checked={insure} onCheckedChange={(on) => setInsure(on === true)} />
                <Label htmlFor="sh-insure">
                  Assurer le colis ({formatMoney(d.insuranceSuggestedMinor, d.currency)})
                </Label>
              </div>
            </section>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button className="h-11" disabled={!d || !form || d.blocked !== null || create.isPending} onClick={submit}>
            Créer l'expédition et l'étiquette
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
