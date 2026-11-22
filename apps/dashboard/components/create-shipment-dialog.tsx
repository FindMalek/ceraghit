"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { formatMoney, postcodeHint, postcodeProblem, type ShipmentCustoms, type ShipmentDraft } from "@workspace/sdk"
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
  hint,
  problem,
}: {
  id: string
  hint?: string | null
  problem?: string | null
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
        aria-invalid={problem ? true : undefined}
        aria-describedby={hint || problem ? `${id}-hint` : undefined}
      />
      {(problem || hint) && (
        <p id={`${id}-hint`} className={problem ? "text-destructive text-sm" : "text-muted-foreground text-sm"}>
          {problem || hint}
        </p>
      )}
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
  const [customs, setCustoms] = useState<ShipmentCustoms | null>(null)
  const [valueText, setValueText] = useState<string[]>([])

  useEffect(() => {
    if (open && draft.data) {
      const { consignee, parcel, description, fragile } = draft.data
      setForm({ consignee, parcel, description, fragile })
      setInsure(false)
      setCustoms(draft.data.customs)
      setValueText(
        draft.data.customs?.items.map((i) =>
          String(i.valueMinor / (draft.data.customs?.currency === "TND" ? 1000 : 100)),
        ) ?? [],
      )
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
    }),
  )

  const d = draft.data
  const setConsignee = (key: keyof Form["consignee"], value: string) =>
    setForm((f) => (f ? { ...f, consignee: { ...f.consignee, [key]: value } } : f))
  const setParcel = (key: keyof Form["parcel"], value: string) =>
    setForm((f) => (f ? { ...f, parcel: { ...f.parcel, [key]: Number(value.replace(/\D/g, "")) } } : f))

  const setItem = (index: number, key: keyof ShipmentCustoms["items"][number], value: string) =>
    setCustoms((c) =>
      c
        ? {
            ...c,
            items: c.items.map((item, i) =>
              i !== index
                ? item
                : key === "valueMinor"
                  ? {
                      ...item,
                      valueMinor:
                        Math.round(Number(value.replace(",", ".")) * (c.currency === "TND" ? 1000 : 100)) || 0,
                    }
                  : key === "quantity"
                    ? { ...item, quantity: Number(value.replace(/\D/g, "")) }
                    : { ...item, [key]: value },
            ),
          }
        : c,
    )
  const declaredMinor = customs?.items.reduce((sum, i) => sum + i.valueMinor, 0) ?? 0

  const submit = () => {
    if (!d || !form) return
    create.mutate({
      orderId,
      ...form,
      insurance: insure ? { amountMinor: d.insuranceSuggestedMinor } : null,
      customs,
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
                  hint={postcodeHint(form.consignee.country)}
                  problem={
                    form.consignee.postalCode
                      ? postcodeProblem(form.consignee.country, form.consignee.postalCode)
                      : null
                  }
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
            {customs && (
              <fieldset className="flex flex-col gap-3" data-testid="shipment-customs">
                <legend className="mb-1 font-heading text-lg">Déclaration en douane</legend>
                <p className="text-muted-foreground text-sm">
                  La valeur déclarée est le prix des pièces, sans la livraison. Montants en {customs.currency}.
                </p>
                {customs.items.map((item, i) => (
                  <div key={`${item.description}-${i}`} className="flex flex-col gap-2 rounded-md border p-3">
                    <Field
                      id={`sh-c-desc-${i}`}
                      label="Description"
                      value={item.description}
                      max={50}
                      onChange={(v) => setItem(i, "description", v)}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <Field
                        id={`sh-c-qty-${i}`}
                        label="Quantité"
                        type="number"
                        value={String(item.quantity)}
                        onChange={(v) => setItem(i, "quantity", v)}
                      />
                      <Field
                        id={`sh-c-value-${i}`}
                        label={`Valeur (${customs.currency})`}
                        value={valueText[i] ?? ""}
                        onChange={(v) => {
                          setValueText((t) => t.map((x, j) => (j === i ? v : x)))
                          setItem(i, "valueMinor", v)
                        }}
                      />
                      <Field
                        id={`sh-c-hs-${i}`}
                        label="Code SH"
                        value={item.hsCode}
                        max={13}
                        onChange={(v) => setItem(i, "hsCode", v)}
                      />
                      <Field
                        id={`sh-c-origin-${i}`}
                        label="Origine (pays)"
                        value={item.originCountry}
                        max={2}
                        onChange={(v) => setItem(i, "originCountry", v.toUpperCase())}
                      />
                    </div>
                  </div>
                ))}
                <p className="text-sm" data-testid="shipment-customs-total">
                  Valeur totale déclarée : {formatMoney(declaredMinor, customs.currency)}
                </p>
              </fieldset>
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
        {create.isError && (
          <p role="alert" className="text-destructive text-sm" data-testid="shipment-error">
            {errorMessage(create.error)}
          </p>
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
