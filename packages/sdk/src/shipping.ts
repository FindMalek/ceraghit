import { EU_PLUS } from "./countries"
import type { Currency, ShippingRates } from "./schemas"

export interface ShippingItem {
  weightGrams: number
  lengthCm: number
  widthCm: number
  heightCm: number
  quantity: number
}

export interface ShippingEstimate {
  available: boolean
  /** Why no price: too heavy or too long for the carrier, or a country we do not ship to. */
  reason?: "too-heavy" | "too-long" | "no-zone"
  zoneId: string | null
  zoneName: string | null
  actualKg: number
  volumetricKg: number
  chargeableKg: number
  amountMinor: number
}

const ceilTo = (value: number, step: number) => Math.ceil(value / step - 1e-9) * step

/**
 * One parcel for the whole cart. Chargeable weight is the larger of the packed weight and the volumetric weight
 * (L x W x H / divisor, DHL Express uses 5000), rounded up to 0.5 kg. Price = zone base up to `baseKg`, plus a rate
 * per extra started kg, times the fuel surcharge, plus the zone's handling, rounded up to half a dinar or half a euro.
 */
export function estimateShipping(
  rates: ShippingRates,
  items: ShippingItem[],
  country: string,
  currency: Currency,
): ShippingEstimate {
  const zone =
    rates.zones.find((z) => z.countries.includes(country)) ?? rates.zones.find((z) => z.countries.includes("*"))
  const none = { zoneId: null, zoneName: null, actualKg: 0, volumetricKg: 0, chargeableKg: 0, amountMinor: 0 }
  if (!zone) return { available: false, reason: "no-zone", ...none }

  const grams = items.reduce((sum, i) => sum + i.weightGrams * i.quantity, 0)
  const actualKg = (grams * (1 + rates.packagingPct / 100) + rates.packagingGrams) / 1000
  const volume = items.reduce((sum, i) => sum + i.lengthCm * i.widthCm * i.heightCm * i.quantity, 0)
  const volumetricKg = volume / rates.volumetricDivisor
  const chargeableKg = ceilTo(Math.max(actualKg, volumetricKg), 0.5)
  const longestSide = Math.max(0, ...items.map((i) => Math.max(i.lengthCm, i.widthCm, i.heightCm)))
  const base = { zoneId: zone.id, zoneName: zone.name, actualKg, volumetricKg, chargeableKg }

  if (chargeableKg > rates.maxKg) return { available: false, reason: "too-heavy", ...base, amountMinor: 0 }
  if (longestSide > rates.maxSideCm) return { available: false, reason: "too-long", ...base, amountMinor: 0 }

  const extraKg = Math.ceil(Math.max(0, chargeableKg - zone.baseKg) - 1e-9)
  const raw =
    (zone.base[currency] + zone.extraPerKg[currency] * extraKg) * (1 + zone.fuelPct / 100) + zone.handling[currency]
  const step = currency === "TND" ? 500 : 50
  return { available: true, ...base, amountMinor: ceilTo(raw, step) }
}

/**
 * Starting rates, estimates from public sources (DHL Express quotes for Europe around 50 EUR per kg, 8-15% fuel
 * surcharge, domestic couriers 4-10 TND per parcel). The real negotiated DHL Tunisia card replaces these.
 */
export const DEFAULT_SHIPPING_RATES: ShippingRates = {
  volumetricDivisor: 5000,
  packagingPct: 20,
  packagingGrams: 300,
  maxKg: 30,
  maxSideCm: 120,
  zones: [
    {
      id: "tn",
      fuelPct: 0,
      name: "Tunisie",
      countries: ["TN"],
      baseKg: 5,
      base: { TND: 8_000, EUR: 250 },
      extraPerKg: { TND: 1_500, EUR: 50 },
      handling: { TND: 3_000, EUR: 100 },
    },
    {
      id: "eu",
      fuelPct: 12,
      name: "Europe",
      countries: EU_PLUS,
      baseKg: 1,
      base: { TND: 150_000, EUR: 4_500 },
      extraPerKg: { TND: 48_000, EUR: 1_400 },
      handling: { TND: 20_000, EUR: 600 },
    },
    {
      id: "world",
      fuelPct: 12,
      name: "Reste du monde",
      countries: ["*"],
      baseKg: 1,
      base: { TND: 200_000, EUR: 6_000 },
      extraPerKg: { TND: 60_000, EUR: 1_800 },
      handling: { TND: 20_000, EUR: 600 },
    },
  ],
}
