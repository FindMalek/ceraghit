"use client"

import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react"
import { countryName, SHIPPING_COUNTRIES } from "@workspace/sdk"
import { Badge } from "@workspace/ui/components/badge"
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
import { Field, FieldDescription, FieldError, FieldLabel, FieldSet } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Switch } from "@workspace/ui/components/switch"
import { useState } from "react"
import { MoneyInput } from "@/components/money-input"
import { emptyZone, type RatesDraft, type RatesErrors, type ZoneDraft } from "@/lib/shipping-draft"

const COUNTRY_OPTIONS = [...SHIPPING_COUNTRIES]
  .map((code) => ({ code, name: countryName(code, "fr") }))
  .sort((a, b) => a.name.localeCompare(b.name, "fr"))

function CountryDialog({
  zone,
  open,
  onOpenChange,
  onChange,
}: {
  zone: ZoneDraft
  open: boolean
  onOpenChange: (open: boolean) => void
  onChange: (countries: string[]) => void
}) {
  const toggle = (code: string, on: boolean) =>
    onChange(on ? [...zone.countries, code] : zone.countries.filter((c) => c !== code))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pays de la zone « {zone.name || "sans nom"} »</DialogTitle>
          <DialogDescription>Un pays ne peut appartenir qu'à une seule zone.</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-1 sm:grid-cols-2">
          {COUNTRY_OPTIONS.map(({ code, name }) => (
            <li key={code}>
              <div className="flex min-h-11 items-center gap-3 px-1">
                <Checkbox
                  id={`country-${code}`}
                  checked={zone.countries.includes(code)}
                  onCheckedChange={(on) => toggle(code, Boolean(on))}
                />
                <label htmlFor={`country-${code}`} className="flex-1 cursor-pointer py-2">
                  {name}
                </label>
              </div>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" className="h-11" onClick={() => onOpenChange(false)}>
            Terminé
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ZoneCard({
  zone,
  index,
  count,
  errors,
  onChange,
  onMove,
  onRemove,
}: {
  zone: ZoneDraft
  index: number
  count: number
  errors: RatesErrors
  onChange: (patch: Partial<ZoneDraft>) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}) {
  const [picking, setPicking] = useState(false)
  const err = (field: string) => errors[`zones.${index}.${field}`]
  const id = (field: string) => `zone-${zone.id}-${field}`
  return (
    <section className="frame flex flex-col gap-4 bg-card/60 p-4">
      <div className="flex items-start gap-2">
        <Field data-invalid={Boolean(err("name"))} className="flex-1">
          <FieldLabel htmlFor={id("name")}>Nom de la zone</FieldLabel>
          <Input
            id={id("name")}
            className="h-11"
            value={zone.name}
            onChange={(e) => onChange({ name: e.target.value })}
            aria-invalid={Boolean(err("name"))}
          />
          {err("name") && <FieldError>{err("name")}</FieldError>}
        </Field>
        <div className="mt-6 flex">
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label="Monter"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUpIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label="Descendre"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDownIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label="Supprimer la zone"
            disabled={count === 1}
            onClick={onRemove}
          >
            <TrashIcon />
          </Button>
        </div>
      </div>

      <Field data-invalid={Boolean(err("countries"))}>
        <FieldLabel>Pays</FieldLabel>
        <div className="flex flex-wrap items-center gap-2">
          {zone.countries.map((code) => (
            <Badge key={code} variant="outline">
              {countryName(code, "fr")}
            </Badge>
          ))}
          {zone.allOthers && <Badge>Tous les autres pays</Badge>}
          <Button type="button" variant="outline" className="h-11" onClick={() => setPicking(true)}>
            Choisir les pays
          </Button>
        </div>
        <div className="flex min-h-11 items-center gap-3">
          <Switch id={id("others")} checked={zone.allOthers} onCheckedChange={(on) => onChange({ allOthers: on })} />
          <label htmlFor={id("others")} className="cursor-pointer">
            Tous les autres pays (zone de repli)
          </label>
        </div>
        {err("countries") && <FieldError>{err("countries")}</FieldError>}
      </Field>
      <CountryDialog
        zone={zone}
        open={picking}
        onOpenChange={setPicking}
        onChange={(countries) => onChange({ countries })}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={Boolean(err("baseKg"))}>
          <FieldLabel htmlFor={id("baseKg")}>Kilos inclus dans le prix de base</FieldLabel>
          <Input
            id={id("baseKg")}
            className="h-11 tabular-nums"
            inputMode="decimal"
            value={zone.baseKg}
            onChange={(e) => onChange({ baseKg: e.target.value })}
            aria-invalid={Boolean(err("baseKg"))}
          />
          {err("baseKg") && <FieldError>{err("baseKg")}</FieldError>}
        </Field>
        <Field data-invalid={Boolean(err("fuelPct"))}>
          <FieldLabel htmlFor={id("fuel")}>Surcharge carburant (%)</FieldLabel>
          <Input
            id={id("fuel")}
            className="h-11 tabular-nums"
            inputMode="decimal"
            value={zone.fuelPct}
            onChange={(e) => onChange({ fuelPct: e.target.value })}
            aria-invalid={Boolean(err("fuelPct"))}
          />
          <FieldDescription>8 à 15 % chez DHL Express, 0 pour un coursier local.</FieldDescription>
          {err("fuelPct") && <FieldError>{err("fuelPct")}</FieldError>}
        </Field>
      </div>

      {(
        [
          ["Prix de base", "base", "Jusqu'au poids de base."],
          ["Par kilo en plus", "extra", "Ajouté par kilo commencé au-delà."],
          ["Manutention", "handling", "Emballage fragile, ajouté une fois."],
        ] as const
      ).map(([label, key, hint]) => (
        <div key={key} className="grid gap-4 sm:grid-cols-2">
          <MoneyInput
            id={id(`${key}Tnd`)}
            label={`${label} en dinars`}
            currency="TND"
            value={zone[`${key}Tnd`]}
            onChange={(v) => onChange({ [`${key}Tnd`]: v })}
            error={err(`${key}Tnd`)}
            hint={hint}
          />
          <MoneyInput
            id={id(`${key}Eur`)}
            label={`${label} en euros`}
            currency="EUR"
            value={zone[`${key}Eur`]}
            onChange={(v) => onChange({ [`${key}Eur`]: v })}
            error={err(`${key}Eur`)}
            hint={hint}
          />
        </div>
      ))}
    </section>
  )
}

function NumberField({
  id,
  label,
  hint,
  value,
  error,
  onChange,
}: {
  id: string
  label: string
  hint: string
  value: string
  error?: string
  onChange: (value: string) => void
}) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        className="h-11 tabular-nums"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
      />
      <FieldDescription>{hint}</FieldDescription>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}

export function ShippingRatesEditor({
  draft,
  errors,
  onChange,
  onReset,
}: {
  draft: RatesDraft
  errors: RatesErrors
  onChange: (draft: RatesDraft) => void
  onReset: () => void
}) {
  const setZone = (index: number, patch: Partial<ZoneDraft>) =>
    onChange({ ...draft, zones: draft.zones.map((z, i) => (i === index ? { ...z, ...patch } : z)) })
  const move = (index: number, direction: -1 | 1) => {
    const zones = [...draft.zones]
    const [zone] = zones.splice(index, 1)
    if (zone) zones.splice(index + direction, 0, zone)
    onChange({ ...draft, zones })
  }
  const addZone = () => {
    const taken = new Set(draft.zones.map((z) => z.id))
    let n = draft.zones.length + 1
    while (taken.has(`zone-${n}`)) n++
    onChange({ ...draft, zones: [...draft.zones, emptyZone(`zone-${n}`)] })
  }
  const global = (key: keyof Omit<RatesDraft, "zones">, value: string) => onChange({ ...draft, [key]: value })

  return (
    <FieldSet>
      <FieldLabel>Grille de livraison</FieldLabel>
      <div className="frame bg-card/60 p-4 text-muted-foreground">
        <p>
          Prix = (base + kilos en plus) × (1 + carburant) + manutention, arrondi au demi-dinar ou au demi-euro. Les
          kilos facturés sont le plus grand du poids emballé et du poids volumétrique (L × l × h ÷ diviseur), arrondi au
          demi-kilo.
        </p>
        <p className="mt-2">
          Ces chiffres sont des <strong>estimations</strong> tirées de sources publiques : DHL ne publie pas sa grille
          depuis la Tunisie (environ 50 € pour 1 kg vers l'Europe, 8 à 15 % de carburant, coursiers locaux 4 à 10 DT le
          colis). Remplacez-les par vos tarifs réels dès que vous les avez.
        </p>
      </div>

      {draft.zones.map((zone, index) => (
        <ZoneCard
          key={zone.id}
          zone={zone}
          index={index}
          count={draft.zones.length}
          errors={errors}
          onChange={(patch) => setZone(index, patch)}
          onMove={(direction) => move(index, direction)}
          onRemove={() => onChange({ ...draft, zones: draft.zones.filter((_, i) => i !== index) })}
        />
      ))}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="h-11" onClick={addZone}>
          <PlusIcon /> Ajouter une zone
        </Button>
        <Button type="button" variant="ghost" className="h-11" onClick={onReset}>
          Remettre les valeurs par défaut
        </Button>
      </div>
      {errors.zones && <FieldError>{errors.zones}</FieldError>}

      <FieldLabel className="mt-4">Réglages communs</FieldLabel>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          id="rates-divisor"
          label="Diviseur volumétrique"
          hint="L × l × h ÷ ce nombre. DHL Express : 5000."
          value={draft.volumetricDivisor}
          error={errors.volumetricDivisor}
          onChange={(v) => global("volumetricDivisor", v)}
        />
        <NumberField
          id="rates-pkg-pct"
          label="Emballage, en % du poids"
          hint="Ajouté au poids de la commande."
          value={draft.packagingPct}
          error={errors.packagingPct}
          onChange={(v) => global("packagingPct", v)}
        />
        <NumberField
          id="rates-pkg-g"
          label="Emballage, en grammes"
          hint="Ajouté une fois par colis."
          value={draft.packagingGrams}
          error={errors.packagingGrams}
          onChange={(v) => global("packagingGrams", v)}
        />
        <NumberField
          id="rates-max-kg"
          label="Poids maximum d'un colis (kg)"
          hint="Au-delà, pas de prix en ligne : sur devis."
          value={draft.maxKg}
          error={errors.maxKg}
          onChange={(v) => global("maxKg", v)}
        />
        <NumberField
          id="rates-max-side"
          label="Plus grande longueur (cm)"
          hint="Au-delà, pas de prix en ligne : sur devis."
          value={draft.maxSideCm}
          error={errors.maxSideCm}
          onChange={(v) => global("maxSideCm", v)}
        />
      </div>
    </FieldSet>
  )
}
