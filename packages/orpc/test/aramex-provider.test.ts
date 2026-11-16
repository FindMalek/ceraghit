import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
  type CreateShipmentRequest,
  ManualShippingProvider,
  type ShipAddress,
  ShippingError,
} from "../src/lib/shipping"
import { AramexClient } from "../src/lib/shipping/aramex/client"
import { AramexShippingProvider, decodeLabel } from "../src/lib/shipping/aramex/provider"
import { CREDS } from "./aramex-creds"

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/aramex/${name}.json`, import.meta.url), "utf8")

function setup(...answers: string[]) {
  const calls: { url: string; body: any }[] = []
  const http = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) })
    return new Response(answers[Math.min(calls.length - 1, answers.length - 1)])
  }) as typeof fetch
  const client = new AramexClient({
    host: "https://ws.dev.aramex.net",
    credentials: CREDS,
    fetch: http,
    sleep: async () => {},
  })
  return { calls, provider: new AramexShippingProvider(client, undefined, http) }
}

const tn: ShipAddress = { name: "Sabri", phone: "+21612345678", line1: "1 Rue Test", city: "Tunis", country: "TN" }
const fr: ShipAddress = {
  name: "Marie",
  phone: "+33600000000",
  line1: "2 Rue Test",
  city: "Paris",
  postalCode: "75001",
  country: "FR",
}
const parcel = { weightGrams: 1500, lengthCm: 30, widthCm: 20, heightCm: 10, pieces: 1 }
const base = (to: ShipAddress): CreateShipmentRequest => ({
  reference: "CG-1001",
  from: tn,
  to,
  parcel,
  description: "Ceramic bowl",
  fragile: true,
  shipDate: new Date("2026-11-16T09:00:00Z"),
})

describe("aramex provider", () => {
  test("DOM for TN to TN, EXP for TN to FR, wcf date and fragile notes", async () => {
    const a = setup(fixture("create-shipments.ok"))
    const dom = await a.provider.createShipment(base(tn))
    const d = a.calls[0]?.body.Shipments[0]
    expect(a.calls[0]?.url).toBe(
      "https://ws.dev.aramex.net/ShippingAPI.V2/Shipping/Service_1_0.svc/json/CreateShipments",
    )
    expect(d.Details.ProductGroup).toBe("DOM")
    expect(d.ShippingDateTime).toBe(`/Date(${Date.parse("2026-11-16T09:00:00Z")})/`)
    expect(d.Comments).toContain("FRAGILE")
    expect(dom.waybill).toBe("44001234567")
    expect(dom.label.url).toContain("labels.example.test")

    const b = setup(fixture("create-shipments.ok"))
    await b.provider.createShipment(base(fr))
    expect(b.calls[0]?.body.Shipments[0].Details.ProductGroup).toBe("EXP")
  })

  test("cod to tunisia is CODS in TND with the right decimal, to France it throws", async () => {
    const a = setup(fixture("create-shipments.ok"))
    await a.provider.createShipment({ ...base(tn), cod: { amountMinor: 12500, currency: "TND" } })
    const details = a.calls[0]?.body.Shipments[0].Details
    expect(details.Services).toBe("CODS")
    expect(details.CashOnDeliveryAmount).toEqual({ CurrencyCode: "TND", Value: 12.5 })

    const b = setup(fixture("create-shipments.ok"))
    const error = await b.provider
      .createShipment({ ...base(fr), cod: { amountMinor: 12500, currency: "TND" } })
      .catch((e) => e)
    expect(error).toBeInstanceOf(ShippingError)
    expect(error.code).toBe("cod-tunisia-only")
    expect(b.calls).toHaveLength(0)
  })

  test("an eur quote asks in eur and returns cents; another currency returns null", async () => {
    const a = setup(fixture("calculate-rate.eur"))
    const quote = await a.provider.quote({ from: tn, to: fr, parcel, currency: "EUR" })
    expect(quote).toMatchObject({ amountMinor: 2735, currency: "EUR", productGroup: "EXP" })
    expect(JSON.stringify(a.calls[0]?.body)).not.toContain("TND")

    expect(
      await setup(fixture("calculate-rate.usd")).provider.quote({ from: tn, to: fr, parcel, currency: "EUR" }),
    ).toBeNull()
    expect(
      await setup(fixture("calculate-rate.ok")).provider.quote({ from: tn, to: tn, parcel, currency: "EUR" }),
    ).toBeNull()
    expect(
      (await setup(fixture("calculate-rate.ok")).provider.quote({ from: tn, to: tn, parcel, currency: "TND" }))
        ?.amountMinor,
    ).toBe(8500)
  })

  test("tracking sorts events, flags delivered and not found", async () => {
    const res = await setup(fixture("track-shipments.ok")).provider.track(["44001234567", "99999999999"])
    expect(res[0]?.events.map((e) => e.code)).toEqual(["SH001", "SH005"])
    expect(res[0]?.delivered).toBe(true)
    expect(res[1]).toMatchObject({ notFound: true, delivered: null, events: [] })
  })

  test("label bytes are the same from base64 and from a number array", async () => {
    expect(decodeLabel("JVBERi0=")).toEqual(decodeLabel([37, 80, 68, 70, 45]))
    const label = await setup(fixture("print-label.ok")).provider.getLabel("44001234567", "DOM")
    expect(Array.from(label.pdf ?? [])).toEqual([37, 80, 68, 70])
  })

  test("cancel is a hold with the agency message, pickup returns ids", async () => {
    const a = setup(fixture("hold-shipments.ok"))
    expect(await a.provider.cancel("44001234567", "client")).toMatchObject({ held: true })
    expect(a.calls[0]?.url.endsWith("/HoldShipments")).toBe(true)
    const p = await setup(fixture("create-pickup.ok")).provider.createPickup({
      reference: "PU1",
      address: tn,
      productGroup: "DOM",
      pickupDate: new Date(0),
      readyTime: new Date(0),
      lastPickupTime: new Date(0),
      closingTime: new Date(0),
      waybills: ["44001234567"],
      pieces: 1,
      weightGrams: 1500,
    })
    expect(p.guid).toContain("7e9d1c9a")
  })

  test("testConnection reports a login refusal without throwing", async () => {
    const res = await setup(fixture("login-error")).provider.testConnection()
    expect(res).toMatchObject({ ok: false, code: "ERR75" })
  })

  test("manual provider quotes nothing and refuses to create", async () => {
    const m = new ManualShippingProvider()
    expect(await m.quote()).toBeNull()
    expect(await m.track()).toEqual([])
    expect((await m.createShipment().catch((e) => e)).code).toBe("unsupported")
  })
})
