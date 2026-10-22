import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"
import { ORDER_STATUS, PRODUCT_STATUS, REQUEST_STATUS } from "@/lib/copy"

const TONE = {
  good: "border-jade/60 bg-jade/15 text-jade",
  warn: "border-ochre/60 bg-ochre/15 text-ochre",
  bad: "border-destructive/60 bg-destructive/10 text-destructive",
  quiet: "border-border bg-transparent text-muted-foreground",
  info: "border-gold/60 bg-gold/10 text-primary",
} as const

function Tone({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) {
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
