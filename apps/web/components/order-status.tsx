"use client"

import { useQuery } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { formatMoney } from "@workspace/sdk"
import { buttonVariants } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"
import { useLocale, useTranslations } from "next-intl"
import { useRef } from "react"
import { Link } from "@/i18n/navigation"

const POLL_MS = 4000
const POLL_FOR_MS = 120_000

export function OrderStatus({ number, token }: { number: string; token: string }) {
  const t = useTranslations("order")
  const locale = useLocale()
  const startedAt = useRef(Date.now())
  const {
    data: order,
    isError,
    isPending,
  } = useQuery(
    orpc.public.orders.get.queryOptions({
      input: { number, token },
      retry: false,
      refetchInterval: (query) =>
        query.state.data?.status === "pending_payment" &&
        query.state.data.paymentMethod === "online" &&
        Date.now() - startedAt.current < POLL_FOR_MS
          ? POLL_MS
          : false,
    }),
  )

  if (isPending) return <Spinner className="mx-auto size-8" />
  if (isError || !order) {
    return (
      <div className="frame space-y-4 bg-card/60 p-8 text-center">
        <p className="text-muted-foreground">{t("notFound")}</p>
        <Link href="/shop" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11")}>
          {t("retryOrder")}
        </Link>
      </div>
    )
  }

  const money = (minor: number) => formatMoney(minor, order.currency, locale)
  const codPending = order.status === "pending_payment" && order.paymentMethod === "cod"
  const waiting = order.status === "pending_payment" && !codPending
  const stillWaiting = waiting && Date.now() - startedAt.current >= POLL_FOR_MS
  return (
    <div className="space-y-8">
      <div className="frame space-y-3 bg-card/70 p-6 text-center" role="status" aria-live="polite">
        <p className="font-display text-3xl text-gold">{codPending ? t("codTitle") : t(`status.${order.status}`)}</p>
        <p className="text-muted-foreground">
          {codPending ? t("codText") : stillWaiting ? t("stillPending") : t(`text.${order.status}`)}
        </p>
        {waiting && !stillWaiting && <Spinner className="mx-auto" />}
      </div>

      <section className="space-y-3">
        <h2 className="text-3xl">{t("items")}</h2>
        <ul className="divide-y divide-border border-border border-y">
          {order.items.map((item) => (
            <li key={item.ref} className="flex justify-between gap-4 py-3">
              <span>
                <span className="font-heading text-muted-foreground text-xs">#{item.ref}</span> {item.title}
                <span className="text-muted-foreground"> · {t("quantity", { count: item.quantity })}</span>
              </span>
              <span className="tabular-nums">{money(item.unitMinor * item.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className="ms-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t("subtotal")}</dt>
            <dd className="tabular-nums">{money(order.subtotalMinor)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t("shipping")}</dt>
            <dd className="tabular-nums">{money(order.shippingMinor)}</dd>
          </div>
          <div className="flex justify-between font-heading text-lg">
            <dt>{t("total")}</dt>
            <dd className="tabular-nums">{money(order.totalMinor)}</dd>
          </div>
        </dl>
      </section>
      <p className="text-center text-muted-foreground text-sm">{t("keepLink")}</p>
    </div>
  )
}
