import { SHIPMENT_STATUS_LABELS, type ShipmentStatus } from "@workspace/sdk"
import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"
import { formatDay, ORDER_STATUS, PRODUCT_STATUS, REQUEST_STATUS } from "@/lib/copy"

const TONE = {
  good: "border-jade/60 bg-jade/15 text-jade",
  warn: "border-ochre/60 bg-ochre/15 text-ochre",
  bad: "border-destructive/60 bg-destructive/10 text-destructive",
  quiet: "border-border bg-transparent text-muted-foreground",
  info: "border-gold/60 bg-gold/10 text-primary",
} as const

export function Tone({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) {
  return (
    <Badge variant="outline" className={cn("h-6 px-2.5 text-sm", TONE[tone])}>
      {children}
    </Badge>
  )
}

export function ProductStatusBadge({ status }: { status: keyof typeof PRODUCT_STATUS }) {
  const tone = status === "published" ? "good" : status === "draft" ? "warn" : "quiet"
  return <Tone tone={tone}>{PRODUCT_STATUS[status]}</Tone>
}

export function OrderStatusBadge({ status }: { status: keyof typeof ORDER_STATUS }) {
  const tone =
    status === "paid" ? "info" : status === "fulfilled" ? "good" : status === "pending_payment" ? "warn" : "bad"
  return <Tone tone={tone}>{ORDER_STATUS[status]}</Tone>
}

export function RequestStatusBadge({ status }: { status: keyof typeof REQUEST_STATUS }) {
  const tone = status === "new" ? "warn" : status === "done" ? "good" : status === "declined" ? "quiet" : "info"
  return <Tone tone={tone}>{REQUEST_STATUS[status]}</Tone>
}

/** Amber "Expire le 18/11" while an unpaid order is close to its release. */
export function HoldBadge({ order }: { order: { holdExpiresAt: string | null; holdWarning: boolean } }) {
  if (!order.holdExpiresAt || !order.holdWarning) return null
  return <Tone tone="warn">Expire le {formatDay(order.holdExpiresAt)}</Tone>
}

/** Payoneer order waiting for the owner to paste the payment link. */
export function LinkBadge({ order }: { order: { status: string; paymentMethod: string; paymentLink: string | null } }) {
  if (order.status !== "pending_payment" || order.paymentMethod !== "payoneer" || order.paymentLink) return null
  return <Tone tone="info">Lien à envoyer</Tone>
}

const SHIPMENT_TONE: Partial<Record<ShipmentStatus, keyof typeof TONE>> = {
  delivered: "good",
  exception: "bad",
  returned: "bad",
  cancelled: "quiet",
  on_hold: "warn",
}

/** Where the Aramex parcel of an order stands, shown next to the order status. */
export function ShipmentBadge({ status }: { status: ShipmentStatus | null }) {
  if (!status) return null
  return <Tone tone={SHIPMENT_TONE[status] ?? "info"}>{SHIPMENT_STATUS_LABELS[status]}</Tone>
}
