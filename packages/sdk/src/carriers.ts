import { z } from "zod"

export const CARRIERS = {
  aramex: { label: "Aramex", trackingUrl: "https://www.aramex.com/track/results?ShipmentNumber={n}" },
  "rapid-poste": { label: "Rapid-Poste (La Poste Tunisienne)", trackingUrl: null },
  dhl: {
    label: "DHL Express",
    trackingUrl: "https://www.dhl.com/tn-fr/home/tracking/tracking-express.html?tracking-id={n}",
  },
  other: { label: "Autre transporteur", trackingUrl: null },
} as const

export type CarrierId = keyof typeof CARRIERS
export const CARRIER_IDS = Object.keys(CARRIERS) as [CarrierId, ...CarrierId[]]
export const carrierIdSchema = z.enum(CARRIER_IDS)

export function trackingUrlFor(carrier: CarrierId, trackingNumber: string): string | null {
  const template = CARRIERS[carrier].trackingUrl
  const n = trackingNumber.trim()
  return template && n ? template.replace("{n}", encodeURIComponent(n)) : null
}

/** What emails and the order page print: `carrierName` as typed for "other", else the preset label. Never translated. */
export function carrierDisplayName(shipping: { carrier: CarrierId; carrierName: string | null }): string {
  return shipping.carrier === "other" && shipping.carrierName ? shipping.carrierName : CARRIERS[shipping.carrier].label
}

/** Links the customer can click: https only, so a pasted `javascript:` never reaches a page. */
export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}
