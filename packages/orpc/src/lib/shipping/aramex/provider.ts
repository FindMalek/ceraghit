import { fromMinor, MINOR_UNITS } from "@workspace/sdk"
import { ShippingError } from "../errors"
import type {
  CreatedShipment,
  CreateShipmentRequest,
  Parcel,
  PickupRequest,
  ProductGroup,
  Quote,
  QuoteRequest,
  ShipAddress,
  ShipCurrency,
  ShipmentLabel,
  ShippingProvider,
  TrackResult,
} from "../types"
import type { AramexClient, AramexRequest } from "./client"
import { fromWcfDate, toWcfDate } from "./dates"
import { isAramexUrl } from "./endpoints"
import { AramexError } from "./errors"

export interface AramexConfig {
  /** Country of the Aramex account: DOM when both ends are in it, EXP otherwise. */
  accountCountry: string
  /** Aramex account entity (e.g. TUN), sent as OriginEntity. Not the country. */
  accountEntity: string
  pickupLocation: string
  productTypes: Record<ProductGroup, string>
  labelReportId: number
  labelReportType: string
  commercialInvoiceReportId: number
  insuranceServiceCode: string
  paymentType: string
  deliveredCodes: string[]
}

export const DEFAULT_ARAMEX_CONFIG: AramexConfig = {
  accountCountry: "TN",
  accountEntity: "TUN",
  pickupLocation: "Atelier",
  productTypes: { DOM: "ONP", EXP: "PPX" },
  labelReportId: 9201,
  labelReportType: "URL",
  commercialInvoiceReportId: 9202,
  insuranceServiceCode: "INSR",
  paymentType: "P",
  deliveredCodes: ["SH005"],
}

const HOLD_MESSAGE = "Mis en attente chez Aramex. Appelez votre agence pour annuler définitivement."
const FRAGILE = "FRAGILE - céramique"

type Details = AramexRequest<"createShipments">["Shipments"][number]["Details"]
type Address = AramexRequest<"validateAddress">["Address"]

const money = (minor: number, currency: ShipCurrency) => ({ CurrencyCode: currency, Value: fromMinor(minor, currency) })
/** Back to minor units, rounded up so a fraction is never undercharged. */
const ceilMinor = (value: number, currency: ShipCurrency) => Math.ceil(value * MINOR_UNITS[currency] - 1e-9)
const kg = (grams: number) => Math.max(0.5, grams / 1000)

function address(a: ShipAddress): Address {
  return {
    Line1: a.line1,
    ...(a.line2 ? { Line2: a.line2 } : {}),
    City: a.city,
    ...(a.postalCode ? { PostCode: a.postalCode } : {}),
    CountryCode: a.country,
  }
}

const contact = (a: ShipAddress) => ({
  PersonName: a.name,
  ...(a.company ? { CompanyName: a.company } : {}),
  PhoneNumber1: a.phone,
  PhoneNumber2: a.phone,
  CellPhone: a.phone,
  ...(a.email ? { EmailAddress: a.email } : {}),
  Type: "",
})

const party = (a: ShipAddress) => ({ PartyAddress: address(a), Contact: contact(a) })

export function decodeLabel(contents: string | number[] | null | undefined): Uint8Array | null {
  if (!contents || (Array.isArray(contents) && contents.length === 0)) return null
  if (typeof contents === "string") return new Uint8Array(Buffer.from(contents, "base64"))
  return Uint8Array.from(contents.map((n) => n & 0xff))
}

export class AramexShippingProvider implements ShippingProvider {
  readonly id = "aramex" as const

  constructor(
    private readonly client: AramexClient,
    private readonly config: AramexConfig = DEFAULT_ARAMEX_CONFIG,
    private readonly http: typeof fetch = fetch,
    private readonly timeoutMs = 10_000,
  ) {}

  productGroupFor(from: ShipAddress, to: ShipAddress): ProductGroup {
    const home = this.config.accountCountry
    return from.country === home && to.country === home ? "DOM" : "EXP"
  }

  private details(
    group: ProductGroup,
    parcel: Parcel,
    description: string,
    origin: string,
    extra: Partial<Details> = {},
  ): Details {
    const weight = { Unit: "KG", Value: kg(parcel.weightGrams) }
    return {
      Dimensions: { Length: parcel.lengthCm, Width: parcel.widthCm, Height: parcel.heightCm, Unit: "CM" },
      ActualWeight: weight,
      ChargeableWeight: weight,
      DescriptionOfGoods: description,
      GoodsOriginCountry: origin,
      NumberOfPieces: parcel.pieces,
      ProductGroup: group,
      ProductType: this.config.productTypes[group],
      PaymentType: this.config.paymentType,
      PaymentOptions: "",
      ...extra,
    }
  }

  async quote(req: QuoteRequest): Promise<Quote | null> {
    const group = this.productGroupFor(req.from, req.to)
    const res = await this.client.calculateRate({
      OriginAddress: address(req.from),
      DestinationAddress: address(req.to),
      ShipmentDetails: this.details(group, req.parcel, "Handmade ceramics", req.from.country),
      PreferredCurrencyCode: req.currency,
    })
    // Never convert: an answer in another currency is no answer
    if (!res.TotalAmount || res.TotalAmount.CurrencyCode !== req.currency) return null
    return {
      amountMinor: ceilMinor(res.TotalAmount.Value, req.currency),
      currency: req.currency,
      productGroup: group,
      productType: this.config.productTypes[group],
      raw: res,
    }
  }

  async createShipment(req: CreateShipmentRequest): Promise<CreatedShipment> {
    const group = this.productGroupFor(req.from, req.to)
    const services: string[] = []
    const extra: Partial<Details> = {}
    if (req.cod) {
      if (req.to.country !== "TN" || group !== "DOM") throw new ShippingError("cod-tunisia-only")
      services.push("CODS")
      extra.CashOnDeliveryAmount = money(req.cod.amountMinor, "TND")
    }
    if (req.insurance) {
      services.push(this.config.insuranceServiceCode)
      extra.InsuranceAmount = money(req.insurance.amountMinor, req.insurance.currency)
    }
    const customs = req.customs
    if (customs && group === "EXP") {
      extra.CustomsValueAmount = money(customs.valueMinor, customs.currency)
      extra.Items = customs.items.map((i) => ({
        PackageType: "Box",
        Quantity: i.quantity,
        Weight: { Unit: "KG", Value: i.weightGrams / 1000 },
        GoodsDescription: i.description,
        CountryOfOrigin: i.originCountry,
        CustomsValue: money(i.valueMinor, customs.currency),
        ...(i.hsCode ? { ProviderHSCode: i.hsCode, CommodityCode: i.hsCode } : {}),
      }))
    }
    if (services.length) extra.Services = services.join(",")
    const res = await this.client.createShipments({
      Shipments: [
        {
          Reference1: req.reference,
          Shipper: party(req.from),
          Consignee: party(req.to),
          ShippingDateTime: toWcfDate(req.shipDate),
          ...(req.fragile ? { Comments: FRAGILE, OperationsInstructions: FRAGILE } : {}),
          Details: this.details(group, req.parcel, req.description, customs?.originCountry ?? req.from.country, extra),
        },
      ],
      LabelInfo: { ReportID: this.config.labelReportId, ReportType: this.config.labelReportType },
      ...(group === "EXP" ? { CommercialInvoiceReportID: this.config.commercialInvoiceReportId } : {}),
    })
    const shipment = res.Shipments[0]
    if (!shipment?.ID) throw new AramexError({ code: "BAD_RESPONSE" })
    const invoice = shipment.ShipmentAttachments.find((a) => a.Type === "CommercialInvoice")
    return {
      waybill: shipment.ID,
      productGroup: group,
      label: {
        url: shipment.ShipmentLabel?.LabelURL ?? null,
        pdf: decodeLabel(shipment.ShipmentLabel?.LabelFileContents),
      },
      commercialInvoiceUrl: invoice?.Url ?? null,
      raw: res,
    }
  }

  async getLabel(waybill: string, productGroup: ProductGroup): Promise<ShipmentLabel> {
    const res = await this.client.printLabel({
      ShipmentNumber: waybill,
      ProductGroup: productGroup,
      OriginEntity: this.config.accountEntity,
      LabelInfo: { ReportID: this.config.labelReportId, ReportType: this.config.labelReportType },
    })
    const url = res.ShipmentLabel?.LabelURL ?? null
    let pdf = decodeLabel(res.ShipmentLabel?.LabelFileContents)
    if (!pdf && url && isAramexUrl(url)) pdf = await this.download(url)
    return { url, pdf }
  }

  async getCommercialInvoice(waybill: string, knownUrl: string | null): Promise<Uint8Array | null> {
    let url = knownUrl
    if (!url) {
      const res = await this.client.printCommercialInvoice({
        ShipmentNumber: waybill,
        ProductGroup: "EXP",
        OriginEntity: this.config.accountEntity,
        ReportID: this.config.commercialInvoiceReportId,
      })
      url = res.CommercialInvoiceInfo?.Url ?? null
    }
    return url && isAramexUrl(url) ? this.download(url) : null
  }

  private async download(url: string): Promise<Uint8Array | null> {
    try {
      // A redirect could leave the Aramex hosts: never follow one
      const res = await this.http(url, { redirect: "manual", signal: AbortSignal.timeout(this.timeoutMs) })
      return res.ok ? new Uint8Array(await res.arrayBuffer()) : null
    } catch {
      return null
    }
  }

  async track(waybills: string[]): Promise<TrackResult[]> {
    if (waybills.length === 0) return []
    const res = await this.client.trackShipments({ Shipments: waybills, GetLastTrackingUpdateOnly: false })
    const byWaybill = new Map(res.TrackingResults.map((r) => [r.Key, r.Value]))
    const missing = new Set(res.NonExistingWaybills)
    return waybills.map((waybill) => {
      const events = (byWaybill.get(waybill) ?? [])
        .map((e) => ({
          code: e.UpdateCode ?? "",
          description: e.UpdateDescription ?? "",
          date: e.UpdateDateTime ? fromWcfDate(e.UpdateDateTime) : new Date(0),
          location: e.UpdateLocation ?? "",
          comment: e.Comments ?? "",
          problemCode: e.ProblemCode || null,
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .map(({ date, ...e }) => ({ ...e, at: date.toISOString() }))
      const notFound = missing.has(waybill) || !byWaybill.has(waybill)
      return {
        waybill,
        events,
        notFound,
        delivered: notFound ? null : events.some((e) => this.config.deliveredCodes.includes(e.code)),
      }
    })
  }

  /** Aramex has no CancelShipment: a hold stops it, the agency cancels for good. */
  async cancel(waybill: string, reason: string) {
    await this.client.holdShipments({ ShipmentHolds: [{ ShipmentNumber: waybill, Comment: reason }] })
    return { held: true, message: HOLD_MESSAGE }
  }

  async validatePickup(req: Parameters<ShippingProvider["validatePickup"]>[0]) {
    const res = await this.client.validatePickup({
      PickupDate: toWcfDate(req.pickupDate),
      ReadyTime: toWcfDate(req.readyTime),
      LastPickupTime: toWcfDate(req.lastPickupTime),
      ClosingTime: toWcfDate(req.closingTime),
    })
    return { valid: true, message: res.Notifications[0]?.Message ?? null }
  }

  async createPickup(req: PickupRequest) {
    const res = await this.client.createPickup({
      Pickup: {
        PickupAddress: address(req.address),
        PickupContact: contact(req.address),
        PickupLocation: this.config.pickupLocation,
        PickupDate: toWcfDate(req.pickupDate),
        ReadyTime: toWcfDate(req.readyTime),
        LastPickupTime: toWcfDate(req.lastPickupTime),
        ClosingTime: toWcfDate(req.closingTime),
        Comments: req.comments ?? "",
        Reference1: req.reference,
        Vehicle: "Car",
        PickupItems: [
          {
            ProductGroup: req.productGroup,
            ProductType: this.config.productTypes[req.productGroup],
            NumberOfShipments: req.waybills.length || 1,
            PackageType: "Box",
            Payment: this.config.paymentType,
            ShipmentWeight: { Unit: "KG", Value: kg(req.weightGrams) },
            NumberOfPieces: req.pieces,
          },
        ],
        ExistingShipments: req.waybills.map((number) => ({
          Number: number,
          OriginEntity: this.config.accountEntity,
          ProductGroup: req.productGroup,
        })),
      },
    })
    const pickup = res.ProcessedPickup
    if (!pickup?.ID || !pickup.GUID) throw new AramexError({ code: "BAD_RESPONSE" })
    return { id: pickup.ID, guid: pickup.GUID }
  }

  async cancelPickup(guid: string, reason: string) {
    await this.client.cancelPickup({ PickupGUID: guid, Comments: reason })
  }

  async fetchCities(country: string): Promise<string[]> {
    return (await this.client.fetchCities({ CountryCode: country })).Cities
  }

  async validateAddress(a: ShipAddress): Promise<{ suggestions: ShipAddress[] }> {
    const res = await this.client.validateAddress({ Address: address(a) })
    const text = (value: unknown) => (typeof value === "string" ? value : "")
    return {
      suggestions: res.SuggestedAddresses.map((s) => ({
        ...a,
        line1: text(s.Line1) || a.line1,
        city: text(s.City) || a.city,
        ...(text(s.PostCode) ? { postalCode: text(s.PostCode) } : {}),
        country: text(s.CountryCode) || a.country,
      })),
    }
  }

  async isAddressServiced(a: ShipAddress): Promise<boolean | null> {
    const res = await this.client.isAddressServiced({
      Address: address(a),
      ServiceDetails: { ProductGroup: "DOM", ProductType: this.config.productTypes.DOM, ServiceMode: "CC" },
    })
    return res.IsServiced ?? null
  }

  async testConnection() {
    const steps: string[] = []
    let step: "login" | "rate" = "login"
    try {
      await this.client.fetchCountries()
      steps.push("FetchCountries")
      step = "rate"
      await this.client.calculateRate({
        OriginAddress: { City: "Tunis", CountryCode: "TN" },
        DestinationAddress: { City: "Sousse", CountryCode: "TN" },
        ShipmentDetails: this.details(
          "DOM",
          { weightGrams: 500, lengthCm: 10, widthCm: 10, heightCm: 10, pieces: 1 },
          "Handmade ceramics",
          "TN",
        ),
        PreferredCurrencyCode: "TND",
      })
      steps.push("CalculateRate")
      return { ok: true as const, steps }
    } catch (error) {
      if (error instanceof AramexError) return { ok: false as const, step, code: error.code, message: error.message }
      throw error
    }
  }
}
