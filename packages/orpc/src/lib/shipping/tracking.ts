import { type ShipmentEvent, shipments } from "@workspace/db"
import { and, asc, eq, notInArray, sql } from "drizzle-orm"
import type { Services } from "../../context"
import { onShipmentDelivered, onShipmentException } from "../shipping-events"
import { looksDelivered, mapAramexStatus } from "./aramex/status"
import { resolveShipping } from "./resolve"
import type { ShippingProvider } from "./types"

const BATCH = 30
const FINISHED = ["delivered", "returned", "cancelled"] as const
const MAX_EVENTS = 100

/** Old and new events, one per (code, at), oldest first, the newest 100 kept. */
export function mergeEvents(known: ShipmentEvent[], fresh: ShipmentEvent[]): ShipmentEvent[] {
  const byKey = new Map<string, ShipmentEvent>()
  for (const e of [...known, ...fresh]) byKey.set(`${e.code}|${e.at}`, e)
  return [...byKey.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-MAX_EVENTS)
}

export interface TrackingReport {
  polled: number
  updated: number
  delivered: number
}

/**
 * Asks the carrier about every shipment that is not finished and stores the events. Idempotent: the same answer twice
 * writes the same events. Does nothing while shipping is manual or the Aramex credentials are missing. Never sets an
 * order status: it only records what the carrier says about the parcel. Throws when the carrier call fails.
 */
export async function trackShipments(
  services: Services,
  provider?: ShippingProvider,
  opts: { shipmentId?: string } = {},
): Promise<TrackingReport | { skipped: string }> {
  const { db, now } = services
  let carrier = provider
  if (!carrier) {
    const resolved = await resolveShipping(services)
    if (resolved.degraded) return { skipped: resolved.degraded }
    carrier = resolved.provider
  }
  if (carrier.id === "manual") return { skipped: "manual shipping" }

  const open = await db
    .select({
      id: shipments.id,
      waybill: shipments.waybill,
      status: shipments.status,
      events: shipments.events,
      lastPolledAt: shipments.lastPolledAt,
    })
    .from(shipments)
    .where(
      and(
        eq(shipments.provider, carrier.id),
        notInArray(shipments.status, [...FINISHED]),
        opts.shipmentId ? eq(shipments.id, opts.shipmentId) : undefined,
      ),
    )
    .orderBy(sql`${shipments.lastPolledAt} asc nulls first`, asc(shipments.createdAt))
    .limit(BATCH)
  const report: TrackingReport = { polled: open.length, updated: 0, delivered: 0 }
  if (open.length === 0) return report

  // A failed poll throws: the run is recorded as failed, so the owner sees it in Réglages.
  const results = await carrier.track(open.map((s) => s.waybill))
  const byWaybill = new Map(results.map((r) => [r.waybill, r]))
  for (const row of open) {
    const found = byWaybill.get(row.waybill)
    const polledAt = now()
    if (!found || found.notFound || found.events.length === 0) {
      await db.update(shipments).set({ lastPolledAt: polledAt }).where(eq(shipments.id, row.id))
      continue
    }
    const events = mergeEvents(row.events, found.events)
    // The "delivered?" answer only matters near the end of the journey; the provider already read it from the codes.
    const delivered = looksDelivered(events) ? found.delivered : false
    const status = mapAramexStatus(events, delivered, row.status)
    const closing = status === "delivered"
    // Compare-and-set on what this poll read: a slower poll that started before another one finished updates nothing,
    // so it can neither overwrite newer events nor move a closed parcel back, and fires no hook.
    const [moved] = await db
      .update(shipments)
      .set({
        events,
        lastEvent: events.at(-1) ?? null,
        lastPolledAt: polledAt,
        status,
        ...(closing ? { deliveredAt: new Date(events.at(-1)?.at ?? polledAt) } : {}),
      })
      .where(
        and(
          eq(shipments.id, row.id),
          eq(shipments.status, row.status),
          notInArray(shipments.status, [...FINISHED]),
          sql`${shipments.lastPolledAt} is not distinct from ${row.lastPolledAt?.toISOString() ?? null}::timestamptz`,
        ),
      )
      .returning({ id: shipments.id })
    if (!moved) continue
    report.updated++
    if (status === row.status) continue
    if (closing) {
      report.delivered++
      await onShipmentDelivered(services, row.id)
    } else if (status === "exception") {
      await onShipmentException(services, row.id)
    }
  }
  return report
}
