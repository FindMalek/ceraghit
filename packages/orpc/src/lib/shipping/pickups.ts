import { ORPCError } from "@orpc/server"
import { orders, shipments } from "@workspace/db"
import type { OpenShipment, PickupInput } from "@workspace/sdk"
import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm"
import type { Services } from "../../context"
import { revertOrderShipped } from "../shipping-events"
import { AramexError } from "./aramex/errors"
import { aramexFor, shipperAddress } from "./shipments"
import type { ShippingProvider } from "./types"

export const NOT_PICKABLE = "Seuls les colis dont l'étiquette vient d'être créée peuvent être ajoutés à un enlèvement."
export const ALREADY_IN_PICKUP = "Un de ces colis est déjà dans un enlèvement."
export const MIXED_GROUPS = "Choisissez des colis du même type (nationaux ou internationaux)."
export const BAD_WINDOW = "La fenêtre d'enlèvement est invalide : un jour ouvré (lundi au samedi), au moins 2 heures."
export const IN_PICKUP = "Ce colis est dans un enlèvement : annulez d'abord l'enlèvement."
export const WITH_ARAMEX = "Le colis est déjà chez Aramex : appelez votre agence pour l'annuler."
export const HOLD_FAILED = "Aramex n'a pas confirmé la mise en attente : appelez votre agence pour annuler ce colis."

const TUNIS = "+01:00"
const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" })

function owner(error: unknown): never {
  if (error instanceof AramexError) throw new ORPCError("BAD_REQUEST", { message: error.message })
  throw error
}

/** Opens in Africa/Tunis (UTC+1 all year): today or later, Monday to Saturday, ready before closing by 2 h or more. */
function windowOf(input: PickupInput, now: Date) {
  const at = (time: string) => new Date(`${input.date}T${time}:00${TUNIS}`)
  const ready = at(input.readyTime)
  const closing = at(input.closingTime)
  const weekday = new Date(`${input.date}T12:00:00Z`).getUTCDay()
  const ok =
    !Number.isNaN(ready.getTime()) &&
    !Number.isNaN(closing.getTime()) &&
    input.date >= DAY.format(now) &&
    weekday !== 0 &&
    closing.getTime() - ready.getTime() >= 2 * 3600e3 &&
    closing.getTime() > now.getTime()
  if (!ok) throw new ORPCError("BAD_REQUEST", { message: BAD_WINDOW })
  return { ready, closing, last: new Date(closing.getTime() - 3600e3) }
}

export async function listOpenShipments(services: Services): Promise<OpenShipment[]> {
  const rows = await services.db
    .select({
      id: shipments.id,
      waybill: shipments.waybill,
      orderNumber: orders.number,
      customerName: orders.customerName,
      weightGrams: shipments.weightGrams,
      productGroup: shipments.productGroup,
      pickupId: shipments.pickupId,
    })
    .from(shipments)
    .innerJoin(orders, eq(orders.id, shipments.orderId))
    .where(and(eq(shipments.provider, "aramex"), eq(shipments.status, "created")))
    .orderBy(asc(shipments.createdAt))
  return rows
}

export async function createPickup(
  services: Services,
  input: PickupInput,
  use?: ShippingProvider,
): Promise<{ pickupId: string }> {
  const { db, now } = services
  const rows = await db.select().from(shipments).where(inArray(shipments.id, input.shipmentIds))
  if (
    rows.length !== new Set(input.shipmentIds).size ||
    rows.some((s) => s.status !== "created" || s.provider !== "aramex")
  )
    throw new ORPCError("BAD_REQUEST", { message: NOT_PICKABLE })
  if (rows.some((s) => s.pickupGuid)) throw new ORPCError("BAD_REQUEST", { message: ALREADY_IN_PICKUP })
  const groups = new Set(rows.map((s) => s.productGroup))
  if (groups.size !== 1) throw new ORPCError("BAD_REQUEST", { message: MIXED_GROUPS })
  const window = windowOf(input, now())

  const { provider, config } = use ? { provider: use, config: {} } : await aramexFor(services, 20_000)
  const times = {
    pickupDate: window.ready,
    readyTime: window.ready,
    lastPickupTime: window.last,
    closingTime: window.closing,
  }
  let created: { id: string; guid: string }
  try {
    await provider.validatePickup(times)
    created = await provider.createPickup({
      ...times,
      reference: rows[0]?.waybill ?? "",
      address: await shipperAddress(services, config),
      productGroup: [...groups][0] as "DOM" | "EXP",
      waybills: rows.map((s) => s.waybill),
      pieces: rows.reduce((n, s) => n + s.pieces, 0),
      weightGrams: rows.reduce((n, s) => n + s.weightGrams, 0),
      ...(input.comments ? { comments: input.comments } : {}),
    })
  } catch (error) {
    owner(error)
  }
  await db
    .update(shipments)
    .set({ pickupId: created.id, pickupGuid: created.guid })
    .where(and(inArray(shipments.id, input.shipmentIds), isNull(shipments.pickupGuid), eq(shipments.status, "created")))
  return { pickupId: created.id }
}

export async function cancelPickup(
  services: Services,
  pickupId: string,
  reason: string,
  use?: ShippingProvider,
): Promise<void> {
  const { db } = services
  const rows = await db
    .select({ id: shipments.id, guid: shipments.pickupGuid })
    .from(shipments)
    .where(and(eq(shipments.pickupId, pickupId), isNotNull(shipments.pickupGuid)))
  const guid = rows[0]?.guid
  if (!guid) throw new ORPCError("NOT_FOUND", { message: "Enlèvement introuvable." })
  const provider = use ?? (await aramexFor(services, 20_000)).provider
  try {
    await provider.cancelPickup(guid, reason)
  } catch (error) {
    owner(error)
  }
  await db
    .update(shipments)
    .set({ pickupId: null, pickupGuid: null })
    .where(
      inArray(
        shipments.id,
        rows.map((r) => r.id),
      ),
    )
}

/**
 * Aramex has no cancellation: only a parcel whose label was just created is cancelled, here at once and at Aramex by a
 * hold. A failed hold still cancels locally (the owner will not hand the parcel over) and says to call the agency.
 */
export async function cancelShipment(
  services: Services,
  adminId: string | null,
  id: string,
  reason: string,
  use?: ShippingProvider,
): Promise<{ held: boolean; message: string }> {
  const { db, now } = services
  const [row] = await db.select().from(shipments).where(eq(shipments.id, id)).limit(1)
  if (!row) throw new ORPCError("NOT_FOUND", { message: "Expédition introuvable." })
  if (row.status !== "created") throw new ORPCError("BAD_REQUEST", { message: WITH_ARAMEX })
  if (row.pickupGuid) throw new ORPCError("BAD_REQUEST", { message: IN_PICKUP })

  let held = false
  let message = "Expédition annulée."
  let failure: { at: string; code: string; message: string } | null = null
  try {
    const provider = use ?? (await aramexFor(services, 20_000)).provider
    await provider.cancel(row.waybill, `Annulée par l'expéditeur: ${reason}`)
    held = true
    message = "Expédition annulée et mise en attente chez Aramex. Si le colis est déjà parti, appelez votre agence."
  } catch {
    failure = { at: now().toISOString(), code: "HOLD", message: HOLD_FAILED }
    message = HOLD_FAILED
  }
  await db.transaction(async (tx) => {
    const [done] = await tx
      .update(shipments)
      .set({ status: "cancelled", errors: failure ? [...row.errors, failure].slice(-20) : row.errors })
      .where(and(eq(shipments.id, id), eq(shipments.status, "created"), isNull(shipments.pickupGuid)))
      .returning({ orderId: shipments.orderId })
    if (!done) throw new ORPCError("BAD_REQUEST", { message: WITH_ARAMEX })
    await revertOrderShipped(tx, done.orderId, adminId, reason)
  })
  return { held, message }
}
