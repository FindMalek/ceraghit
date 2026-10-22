"use client"

import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { LocalizedField } from "@/components/localized-field"
import { MoneyInput } from "@/components/money-input"
import { emptyLocalized, type LocalizedDraft } from "@/lib/localized"

export interface VariantDraft {
  /** Present for a variant that already exists, so saving keeps the orders that hold its stock. */
  id?: string
  label: LocalizedDraft
  priceTnd: string
  priceEur: string
  stock: string
}

export const emptyVariant = (): VariantDraft => ({ label: emptyLocalized(), priceTnd: "", priceEur: "", stock: "1" })

/** Options of one piece (émaillée, terre cuite…): each has its own TND and EUR price and its own stock. */
export function VariantsField({
  value,
  onChange,
  errors,
  onFirst,
}: {
  value: VariantDraft[]
  onChange: (value: VariantDraft[]) => void
  errors: Record<string, string>
  /** Adds the first variant, pre-filled from the product's own price and stock. */
  onFirst: () => void
}) {
  const update = (index: number, patch: Partial<VariantDraft>) =>
    onChange(value.map((v, i) => (i === index ? { ...v, ...patch } : v)))
  const move = (index: number, by: -1 | 1) => {
    const next = [...value]
    const [item] = next.splice(index, 1)
    next.splice(index + by, 0, item as VariantDraft)
    onChange(next)
  }

  return (
    <div className="space-y-4">
      <div>
        <FieldLabel>Variantes</FieldLabel>
        <FieldDescription>
          Pour une pièce qui existe en plusieurs versions (émaillée ou non, par exemple). Avec des variantes, le prix et
          le stock viennent de chaque variante.
        </FieldDescription>
      </div>

      {value.map((variant, index) => {
        const id = `variant-${index}`
        const error = (field: string) => errors[`variants.${index}.${field}`]
        return (
          <div key={variant.id ?? id} className="frame space-y-4 bg-card/60 p-4">
            <LocalizedField
              id={`${id}-label`}
              label="Nom de la variante"
              required
              value={variant.label}
              onChange={(label) => update(index, { label })}
              error={error("label.fr") ? "Le français est obligatoire." : undefined}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <MoneyInput
                id={`${id}-tnd`}
                label="Prix TND *"
                currency="TND"
                value={variant.priceTnd}
                onChange={(priceTnd) => update(index, { priceTnd })}
                error={error("priceTnd")}
              />
              <MoneyInput
                id={`${id}-eur`}
                label="Prix EUR *"
                currency="EUR"
                value={variant.priceEur}
                onChange={(priceEur) => update(index, { priceEur })}
                error={error("priceEur")}
              />
              <Field data-invalid={Boolean(error("stock"))}>
                <FieldLabel htmlFor={`${id}-stock`}>Stock</FieldLabel>
                <Input
                  id={`${id}-stock`}
                  className="h-11 tabular-nums"
                  inputMode="numeric"
                  value={variant.stock}
                  onChange={(event) => update(index, { stock: event.target.value })}
                />
                {error("stock") && <FieldError>{error("stock")}</FieldError>}
              </Field>
            </div>
            <div className="flex justify-end gap-1">
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Monter la variante"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUpIcon />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Descendre la variante"
                disabled={index === value.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDownIcon />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Supprimer la variante"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                <TrashIcon />
              </Button>
            </div>
          </div>
        )
      })}

      <Button
        type="button"
        variant="outline"
        className="h-11"
        onClick={() => (value.length === 0 ? onFirst() : onChange([...value, emptyVariant()]))}
      >
        <PlusIcon /> Ajouter une variante
      </Button>
    </div>
  )
}
