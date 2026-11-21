import type { ShipmentEvent } from "@workspace/db"
import type { ShipmentStatus } from "@workspace/sdk"

/**
 * Aramex tracking codes are NOT verified against the sandbox yet (#198): the code is matched first, the English
 * description is the fallback. Keep every guess in this table.
 */
const BY_CODE: Record<string, ShipmentStatus> = {
  SH005: "delivered",
  SH006: "delivered",
  SH003: "out_for_delivery",
  SH069: "returned",
  SH012: "picked_up",
}

const KEYWORDS: [ShipmentStatus, string[]][] = [
  ["returned", ["returned to shipper"]],
  ["exception", ["not delivered", "undelivered", "on hold", "refused", "incorrect"]],
  ["delivered", ["delivered", "collected by consignee"]],
  ["out_for_delivery", ["out for delivery"]],
  ["picked_up", ["picked up", "received at origin"]],
]

/** Where a parcel can only go forward; `exception` may interrupt it and the flow resumes after. */
const FLOW: ShipmentStatus[] = ["created", "picked_up", "in_transit", "out_for_delivery", "delivered"]

function classify(event: ShipmentEvent): ShipmentStatus {
  if (event.problemCode) return "exception"
  const byCode = BY_CODE[event.code]
  if (byCode) return byCode
  const text = event.description.toLowerCase()
  return KEYWORDS.find(([, words]) => words.some((w) => text.includes(w)))?.[0] ?? "in_transit"
}

/** True when the newest event looks like the end of the journey, so asking Aramex "delivered?" is worth a call. */
export function looksDelivered(events: ShipmentEvent[]): boolean {
  const last = events.at(-1)
  return !!last && ["delivered", "out_for_delivery"].includes(classify(last))
}

/** The status the events say, never moving a parcel backwards (an exception and its recovery excepted). */
export function mapAramexStatus(
  events: ShipmentEvent[],
  delivered: boolean | null,
  current: ShipmentStatus = "created",
): ShipmentStatus {
  if (current === "delivered" || current === "returned" || current === "cancelled") return current
  const last = events.at(-1)
  const next: ShipmentStatus = delivered === true ? "delivered" : last ? classify(last) : current
  if (next === "delivered" || next === "returned" || next === "exception") return next
  if (current === "on_hold") return current
  if (current === "exception") return next
  return FLOW.indexOf(next) >= FLOW.indexOf(current) ? next : current
}
