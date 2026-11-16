export type ShippingProviderId = "manual" | "aramex"
export type ShipCurrency = "TND" | "EUR"
export type ProductGroup = "DOM" | "EXP"

export interface ShipAddress {
  name: string
  company?: string
  phone: string
  email?: string
  line1: string
  line2?: string
  city: string
  postalCode?: string
  /** ISO-2 */
  country: string
}

export interface Parcel {
  weightGrams: number
  lengthCm: number
  widthCm: number
  heightCm: number
  pieces: number
}

export interface QuoteRequest {
  from: ShipAddress
  to: ShipAddress
  parcel: Parcel
  currency: ShipCurrency
}

export interface Quote {
  amountMinor: number
  currency: ShipCurrency
  productGroup: ProductGroup
  productType: string
  raw: unknown
}

export interface CustomsItem {
  description: string
  quantity: number
  weightGrams: number
  valueMinor: number
  hsCode?: string
  originCountry: string
}

export interface CreateShipmentRequest {
  /** Order number */
  reference: string
  from: ShipAddress
  to: ShipAddress
  parcel: Parcel
  description: string
  fragile: boolean
  cod?: { amountMinor: number; currency: "TND" }
  insurance?: { amountMinor: number; currency: ShipCurrency }
  customs?: { valueMinor: number; currency: ShipCurrency; originCountry: string; items: CustomsItem[] }
  shipDate: Date
}

export interface ShipmentLabel {
  url: string | null
  pdf: Uint8Array | null
}

export interface CreatedShipment {
  waybill: string
  productGroup: ProductGroup
  label: ShipmentLabel
  commercialInvoiceUrl: string | null
  raw: unknown
}

export interface TrackingEvent {
  code: string
  description: string
  /** ISO */
  at: string
  location: string
  comment: string
  problemCode: string | null
}

export interface TrackResult {
  waybill: string
  events: TrackingEvent[]
  delivered: boolean | null
  notFound: boolean
}

export interface PickupRequest {
  reference: string
  address: ShipAddress
  productGroup: ProductGroup
  pickupDate: Date
  readyTime: Date
  lastPickupTime: Date
  closingTime: Date
  waybills: string[]
  pieces: number
  weightGrams: number
  comments?: string
}

export type ConnectionResult = { ok: true } | { ok: false; code: string; message: string }

/** What manual carriers and Aramex both implement; callers never see a provider's wire format. */
export interface ShippingProvider {
  id: ShippingProviderId
  /** Manual: null (the flat rates answer). Aramex: null when it cannot price in the requested currency. */
  quote(req: QuoteRequest): Promise<Quote | null>
  createShipment(req: CreateShipmentRequest): Promise<CreatedShipment>
  getLabel(waybill: string, productGroup: ProductGroup): Promise<ShipmentLabel>
  track(waybills: string[]): Promise<TrackResult[]>
  cancel(waybill: string, reason: string): Promise<{ held: boolean; message: string }>
  createPickup(req: PickupRequest): Promise<{ id: string; guid: string }>
  cancelPickup(guid: string, reason: string): Promise<void>
  testConnection(): Promise<ConnectionResult>
}
