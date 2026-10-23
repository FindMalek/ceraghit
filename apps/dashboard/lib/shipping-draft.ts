import { type ShippingRates, shippingRatesSchema } from "@workspace/sdk"
import { inputToMinor, minorToInput } from "@/lib/money"

export interface ZoneDraft {
  id: string
  name: string
  allOthers: boolean
  countries: string[]
  baseKg: string
  fuelPct: string
  baseTnd: string
  baseEur: string
  extraTnd: string
  extraEur: string
  handlingTnd: string
  handlingEur: string
  freeEnabled: boolean
  freeTnd: string
  freeEur: string
}

export interface RatesDraft {
  zones: ZoneDraft[]
  volumetricDivisor: string
  packagingPct: string
  packagingGrams: string
  maxKg: string
  maxSideCm: string
}

export type RatesErrors = Record<string, string>

export function ratesToDraft(rates: ShippingRates): RatesDraft {
  return {
    zones: rates.zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      allOthers: zone.countries.includes("*"),
      countries: zone.countries.filter((c) => c !== "*"),
      baseKg: String(zone.baseKg),
      fuelPct: String(zone.fuelPct),
      baseTnd: minorToInput(zone.base.TND, "TND"),
      baseEur: minorToInput(zone.base.EUR, "EUR"),
      extraTnd: minorToInput(zone.extraPerKg.TND, "TND"),
      extraEur: minorToInput(zone.extraPerKg.EUR, "EUR"),
      handlingTnd: minorToInput(zone.handling.TND, "TND"),
      handlingEur: minorToInput(zone.handling.EUR, "EUR"),
      freeEnabled: zone.freeOver !== null,
      freeTnd: minorToInput(zone.freeOver?.TND ?? 0, "TND"),
      freeEur: minorToInput(zone.freeOver?.EUR ?? 0, "EUR"),
    })),
    volumetricDivisor: String(rates.volumetricDivisor),
    packagingPct: String(rates.packagingPct),
    packagingGrams: String(rates.packagingGrams),
    maxKg: String(rates.maxKg),
    maxSideCm: String(rates.maxSideCm),
  }
}

const num = (text: string): number => Number(text.trim().replace(",", "."))

export function emptyZone(id: string): ZoneDraft {
  return {
    id,
    name: "",
    allOthers: false,
    countries: [],
    baseKg: "1",
    fuelPct: "0",
    baseTnd: "0",
    baseEur: "0",
    extraTnd: "0",
    extraEur: "0",
    handlingTnd: "0",
    handlingEur: "0",
    freeEnabled: false,
    freeTnd: "0",
    freeEur: "0",
  }
}

/** Turns the form back into rates; errors are keyed like `zones.0.baseTnd` or `maxKg`. */
export function draftToRates(draft: RatesDraft): { rates: ShippingRates | null; errors: RatesErrors } {
  const errors: RatesErrors = {}
  const money = (key: string, text: string, currency: "TND" | "EUR"): number => {
    const minor = inputToMinor(text || "0", currency)
    if (minor === null) errors[key] = currency === "TND" ? "Montant en dinars invalide." : "Montant en euros invalide."
    return minor ?? 0
  }
  const owner = new Map<string, string>()
  const zones = draft.zones.map((zone, i) => {
    const at = (field: string) => `zones.${i}.${field}`
    if (!zone.name.trim()) errors[at("name")] = "Donnez un nom à la zone."
    if (!zone.allOthers && zone.countries.length === 0) errors[at("countries")] = "Choisissez au moins un pays."
    for (const code of zone.countries) {
      const other = owner.get(code)
      if (other && other !== zone.id) errors[at("countries")] = "Un pays ne peut être que dans une seule zone."
      owner.set(code, zone.id)
    }
    const baseKg = num(zone.baseKg)
    if (!(baseKg > 0)) errors[at("baseKg")] = "Entrez un nombre de kilos."
    const fuelPct = num(zone.fuelPct || "0")
    if (!(fuelPct >= 0 && fuelPct <= 100)) errors[at("fuelPct")] = "Entre 0 et 100."
    return {
      id: zone.id,
      name: zone.name.trim(),
      countries: zone.allOthers ? [...zone.countries, "*"] : zone.countries,
      baseKg,
      fuelPct,
      base: { TND: money(at("baseTnd"), zone.baseTnd, "TND"), EUR: money(at("baseEur"), zone.baseEur, "EUR") },
      extraPerKg: {
        TND: money(at("extraTnd"), zone.extraTnd, "TND"),
        EUR: money(at("extraEur"), zone.extraEur, "EUR"),
      },
      handling: {
        TND: money(at("handlingTnd"), zone.handlingTnd, "TND"),
        EUR: money(at("handlingEur"), zone.handlingEur, "EUR"),
      },
      freeOver: zone.freeEnabled
        ? { TND: money(at("freeTnd"), zone.freeTnd, "TND"), EUR: money(at("freeEur"), zone.freeEur, "EUR") }
        : null,
    }
  })
  const integer = (key: string, text: string, min: number, message: string): number => {
    const value = num(text)
    if (!Number.isFinite(value) || value < min) errors[key] = message
    return value
  }
  const parsed = shippingRatesSchema.safeParse({
    zones,
    volumetricDivisor: integer(
      "volumetricDivisor",
      draft.volumetricDivisor,
      1000,
      "Entre 1000 et 10000, DHL utilise 5000.",
    ),
    packagingPct: integer("packagingPct", draft.packagingPct, 0, "Entrez un pourcentage."),
    packagingGrams: integer("packagingGrams", draft.packagingGrams, 0, "Entrez des grammes."),
    maxKg: integer("maxKg", draft.maxKg, 1, "Entrez un poids maximum en kilos."),
    maxSideCm: integer("maxSideCm", draft.maxSideCm, 1, "Entrez une longueur maximum en cm."),
  })
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path.slice(0, 3).join(".")
      if (!errors[key]) errors[key] = issue.message
    }
  }
  return { rates: Object.keys(errors).length === 0 && parsed.success ? parsed.data : null, errors }
}
