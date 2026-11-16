import { ORPCError } from "@orpc/server"
import { orders } from "@workspace/db"
import { type CarrierId, isHttpsUrl, trackingUrlFor } from "@workspace/sdk"
import { and, eq, or, sql } from "drizzle-orm"
import type { Services } from "../context"
import { recordAudit } from "./orders"

export interface ShipInput {
  carrier: CarrierId
  carrierName?: string
  trackingNumber?: string
  trackingUrl?: string
}

const CANNOT_SHIP = "Cette commande ne peut pas être expédiée dans son état actuel."

/** Normalised tracking columns; rejects any link that is not https. */
export function trackingColumns(input: ShipInput) {
  const trackingNumber = input.trackingNumber?.trim() || null
  const trackingUrl =
    input.trackingUrl?.trim() || (trackingNumber ? trackingUrlFor(input.carrier, trackingNumber) : null)
  if (trackingUrl && !isHttpsUrl(trackingUrl)) {
    throw new ORPCError("BAD_REQUEST", { message: "Le lien de suivi doit commencer par https://." })
  }
  const carrierName = input.carrier === "other" ? input.carrierName?.trim() || null : null
  return { carrier: input.carrier, carrierName, trackingNumber, trackingUrl }
}

/**
 * Paid orders, and cash-on-delivery orders still awaiting payment (the sale counts once it ships), become fulfilled.
 * One guarded update, so two tabs ship once. A failing hook never fails the request.
 */
export async function markOrderShipped(
  services: Services,
  orderId: string,
  input: ShipInput,
  opts: { adminId?: string | null } = {},
): Promise<{ status: "fulfilled" }> {
  const columns = trackingColumns(input)
  let number = ""
  await services.db.transaction(async (tx) => {
    const [before] = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId)).for("update")
    if (!before) throw new ORPCError("NOT_FOUND", { message: "Commande introuvable." })
    const [row] = await tx
      .update(orders)
      .set({
        status: "fulfilled",
        shippedAt: sql`clock_timestamp()`,
        ...columns,
        paidAt: sql`coalesce(${orders.paidAt}, case when ${orders.status} = 'pending_payment' then clock_timestamp() end)`,
        paymentProvider: sql`case when ${orders.status} = 'pending_payment' then coalesce(${orders.paymentProvider}, 'cod') else ${orders.paymentProvider} end`,
      })
      .where(
        and(
          eq(orders.id, orderId),
          or(eq(orders.status, "paid"), and(eq(orders.status, "pending_payment"), eq(orders.paymentMethod, "cod"))),
        ),
      )
      .returning({ id: orders.id, number: orders.number })
    if (!row) throw new ORPCError("BAD_REQUEST", { message: CANNOT_SHIP })
    number = row.number
    await recordAudit(tx, {
      orderId,
      adminId: opts.adminId ?? null,
      action: "set_status",
      fromStatus: before.status,
      toStatus: "fulfilled",
    })
  })
  try {
    await onOrderShipped(services, orderId)
  } catch {
    console.error("[shipped-hook] failed", number)
  }
  return { status: "fulfilled" }
}

/** The one place the shipped email plugs in. */
export async function onOrderShipped(services: Services, orderId: string): Promise<void> {
  await services.hooks?.orderShipped?.(orderId)
}

/** Edits the tracking of an order that already shipped. Does not fire the hook again. */
export async function updateOrderTracking(services: Services, orderId: string, input: ShipInput): Promise<void> {
  const columns = trackingColumns(input)
  const [row] = await services.db
    .update(orders)
    .set(columns)
    .where(and(eq(orders.id, orderId), eq(orders.status, "fulfilled")))
    .returning({ id: orders.id })
  if (!row) throw new ORPCError("BAD_REQUEST", { message: "Seule une commande expédiée peut changer de suivi." })
}

export function toShipping(o: typeof orders.$inferSelect) {
  if (!o.carrier) return null
  return {
    carrier: o.carrier as CarrierId,
    carrierName: o.carrierName,
    trackingNumber: o.trackingNumber,
    trackingUrl: o.trackingUrl,
    shippedAt: o.shippedAt?.toISOString() ?? null,
  }
}
