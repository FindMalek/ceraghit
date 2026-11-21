import { shipments } from "@workspace/db"
import { and, asc, eq, notInArray, sql } from "drizzle-orm"
import type { Services } from "../../context"
import { resolveShipping } from "./resolve"
import type { ShippingProvider } from "./types"

const BATCH = 30
const FINISHED = ["delivered", "returned", "cancelled"] as const

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
    .select({ id: shipments.id, waybill: shipments.waybill })
    .from(shipments)
    .where(and(eq(shipments.provider, carrier.id), notInArray(shipments.status, [...FINISHED])))
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
    const events = [...found.events].sort((a, b) => a.at.localeCompare(b.at))
    const isDelivered = found.delivered === true
    await db
      .update(shipments)
      .set({
        events,
        lastEvent: events.at(-1) ?? null,
        lastPolledAt: polledAt,
        ...(isDelivered ? { status: "delivered" as const, deliveredAt: polledAt } : {}),
      })
      .where(eq(shipments.id, row.id))
    report.updated++
    if (isDelivered) report.delivered++
  }
  return report
}
