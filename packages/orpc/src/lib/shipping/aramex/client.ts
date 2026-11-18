import type { z } from "zod"
import { withSpan } from "../../telemetry"
import { type AramexService, serviceUrl } from "./endpoints"
import { AramexError } from "./errors"
import * as s from "./schemas"

export interface AramexCredentials {
  userName: string
  password: string
  accountNumber: string
  accountPin: string
  accountEntity: string
  accountCountryCode: string
  version: string
  source: number | null
}

export interface AramexClientOptions {
  host: string
  credentials: AramexCredentials
  fetch?: typeof fetch
  timeoutMs?: number
  retries?: number
  /** Injected so tests never wait. */
  sleep?: (ms: number) => Promise<void>
}

export function buildClientInfo(c: AramexCredentials): s.ClientInfo {
  return {
    UserName: c.userName,
    Password: c.password,
    Version: c.version,
    AccountNumber: c.accountNumber,
    AccountPin: c.accountPin,
    AccountEntity: c.accountEntity,
    AccountCountryCode: c.accountCountryCode,
    ...(c.source === null ? {} : { Source: c.source }),
    PreferredLanguageCode: "en",
  }
}

interface Operation<Req extends z.ZodType, Res extends z.ZodType> {
  service: AramexService
  name: string
  request: Req
  response: Res
  /** Safe to send twice. CreateShipments and CreatePickup are not: a retry could make a second waybill. */
  idempotent: boolean
}
const op = <Req extends z.ZodType, Res extends z.ZodType>(
  service: AramexService,
  name: string,
  request: Req,
  response: Res,
  idempotent: boolean,
): Operation<Req, Res> => ({ service, name, request, response, idempotent })

export const OPERATIONS = {
  createShipments: op(
    "Shipping",
    "CreateShipments",
    s.shipmentCreationRequestSchema,
    s.shipmentCreationResponseSchema,
    false,
  ),
  printLabel: op("Shipping", "PrintLabel", s.labelPrintingRequestSchema, s.labelPrintingResponseSchema, true),
  createPickup: op("Shipping", "CreatePickup", s.pickupCreationRequestSchema, s.pickupCreationResponseSchema, false),
  validatePickup: op(
    "Shipping",
    "ValidatePickup",
    s.pickupValidationRequestSchema,
    s.pickupValidationResponseSchema,
    true,
  ),
  cancelPickup: op(
    "Shipping",
    "CancelPickup",
    s.pickupCancelationRequestSchema,
    s.pickupCancelationResponseSchema,
    true,
  ),
  holdShipments: op("Shipping", "HoldShipments", s.holdCreationRequestSchema, s.holdCreationResponseSchema, true),
  printCommercialInvoice: op(
    "Shipping",
    "PrintCommercialInvoice",
    s.commercialInvoicePrintingRequestSchema,
    s.commercialInvoicePrintingResponseSchema,
    true,
  ),
  calculateRate: op(
    "RateCalculator",
    "CalculateRate",
    s.rateCalculatorRequestSchema,
    s.rateCalculatorResponseSchema,
    true,
  ),
  trackShipments: op(
    "Tracking",
    "TrackShipments",
    s.shipmentTrackingRequestSchema,
    s.shipmentTrackingResponseSchema,
    true,
  ),
  hasShipmentBeenDelivered: op(
    "Tracking",
    "HasShipmentBeenDelivered",
    s.shipmentDeliveredRequestSchema,
    s.shipmentDeliveredResponseSchema,
    true,
  ),
  fetchCountries: op(
    "Location",
    "FetchCountries",
    s.countriesFetchingRequestSchema,
    s.countriesFetchingResponseSchema,
    true,
  ),
  fetchCities: op("Location", "FetchCities", s.citiesFetchingRequestSchema, s.citiesFetchingResponseSchema, true),
  validateAddress: op(
    "Location",
    "ValidateAddress",
    s.addressValidationRequestSchema,
    s.addressValidationResponseSchema,
    true,
  ),
  isAddressServiced: op(
    "Location",
    "IsAddressServiced",
    s.addressServiceabilityRequestSchema,
    s.addressServiceabilityResponseSchema,
    true,
  ),
} as const

type Ops = typeof OPERATIONS
export type AramexRequest<K extends keyof Ops> = z.input<Ops[K]["request"]>
export type AramexResponse<K extends keyof Ops> = z.output<Ops[K]["response"]>

const BACKOFF_MS = [300, 900]

/** Request bodies hold the password and PIN: they are never logged and never put in an error. */
export class AramexClient {
  private readonly http: typeof fetch
  private readonly timeoutMs: number
  private readonly retries: number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(private readonly opts: AramexClientOptions) {
    this.http = opts.fetch ?? fetch
    this.timeoutMs = opts.timeoutMs ?? 10_000
    this.retries = opts.retries ?? 2
    this.sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  }

  async call<K extends keyof Ops>(key: K, body: AramexRequest<K>): Promise<AramexResponse<K>> {
    const operation: Ops[K] = OPERATIONS[key]
    const payload = {
      ClientInfo: buildClientInfo(this.opts.credentials),
      Transaction: null,
      ...(operation.request.parse(body) as object),
    }
    const attempts = operation.idempotent ? this.retries + 1 : 1
    let last: AramexError | null = null
    for (let i = 0; i < attempts; i++) {
      if (i > 0) await this.sleep(BACKOFF_MS[Math.min(i - 1, BACKOFF_MS.length - 1)] ?? 900)
      try {
        return (await withSpan(`aramex.${operation.name.toLowerCase()}`, { "aramex.service": operation.service }, () =>
          this.once(operation, payload),
        )) as AramexResponse<K>
      } catch (error) {
        if (!(error instanceof AramexError) || !error.retriable) throw error
        last = error
      }
    }
    throw last as AramexError
  }

  private async once(operation: Operation<z.ZodType, z.ZodType>, payload: unknown): Promise<unknown> {
    const { credentials } = this.opts
    const secrets = [credentials.password, credentials.accountPin]
    let res: Response
    try {
      res = await this.http(serviceUrl(this.opts.host, operation.service, operation.name), {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
      throw new AramexError({ code: timedOut ? "TIMEOUT" : "UNREACHABLE", retriable: true, secrets })
    }
    if (res.status >= 500)
      throw new AramexError({ code: "BAD_RESPONSE", httpStatus: res.status, retriable: true, secrets })
    let json: unknown
    try {
      json = JSON.parse(await res.text())
    } catch {
      // Malformed requests come back as an HTML "Request Error" page
      throw new AramexError({ code: "BAD_RESPONSE", httpStatus: res.status, secrets })
    }
    const parsed = operation.response.safeParse(json)
    if (!parsed.success) throw new AramexError({ code: "BAD_RESPONSE", httpStatus: res.status, secrets })
    const data = parsed.data as {
      HasErrors?: boolean
      Notifications?: { Code?: string | null; Message?: string | null }[]
      Shipments?: { HasErrors?: boolean; Notifications?: { Code?: string | null; Message?: string | null }[] }[]
      ProcessedShipmentHolds?: {
        HasErrors?: boolean
        Notifications?: { Code?: string | null; Message?: string | null }[]
      }[]
    }
    // A success wrapper can still hold a failed shipment
    const failed = data.HasErrors
      ? data
      : [...(data.Shipments ?? []), ...(data.ProcessedShipmentHolds ?? [])].find((p) => p.HasErrors)
    if (failed) {
      const notifications = (failed.Notifications ?? []).map((n) => ({ code: n.Code ?? "", message: n.Message ?? "" }))
      throw new AramexError({ code: notifications[0]?.code || "REFUSED", notifications, secrets })
    }
    return parsed.data
  }

  createShipments = (b: AramexRequest<"createShipments">) => this.call("createShipments", b)
  printLabel = (b: AramexRequest<"printLabel">) => this.call("printLabel", b)
  createPickup = (b: AramexRequest<"createPickup">) => this.call("createPickup", b)
  validatePickup = (b: AramexRequest<"validatePickup">) => this.call("validatePickup", b)
  cancelPickup = (b: AramexRequest<"cancelPickup">) => this.call("cancelPickup", b)
  holdShipments = (b: AramexRequest<"holdShipments">) => this.call("holdShipments", b)
  printCommercialInvoice = (b: AramexRequest<"printCommercialInvoice">) => this.call("printCommercialInvoice", b)
  calculateRate = (b: AramexRequest<"calculateRate">) => this.call("calculateRate", b)
  trackShipments = (b: AramexRequest<"trackShipments">) => this.call("trackShipments", b)
  hasShipmentBeenDelivered = (b: AramexRequest<"hasShipmentBeenDelivered">) => this.call("hasShipmentBeenDelivered", b)
  fetchCountries = () => this.call("fetchCountries", {})
  fetchCities = (b: AramexRequest<"fetchCities">) => this.call("fetchCities", b)
  validateAddress = (b: AramexRequest<"validateAddress">) => this.call("validateAddress", b)
  isAddressServiced = (b: AramexRequest<"isAddressServiced">) => this.call("isAddressServiced", b)
}
