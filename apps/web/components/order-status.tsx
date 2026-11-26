"use client"

import { useQuery } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { carrierDisplayName, formatMoney } from "@workspace/sdk"
import { buttonVariants } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"
import { useLocale, useTranslations } from "next-intl"
import { useRef } from "react"
import { Link } from "@/i18n/navigation"

const POLL_MS = 4000
const POLL_FOR_MS = 120_000

/** Our own words for the parcel's status, never the carrier's text. Unknown or held statuses show nothing. */
const PARCEL_KEYS: Record<string, string> = {
  created: "parcelCreated",
  picked_up: "parcelPickedUp",
  in_transit: "parcelInTransit",
  out_for_delivery: "parcelOutForDelivery",
  delivered: "parcelDelivered",
  exception: "parcelException",
  returned: "parcelReturned",
}

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

  const day = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "Africa/Tunis" }).format(new Date(iso))
  const parcelKey = order.shipping?.parcelStatus ? PARCEL_KEYS[order.shipping.parcelStatus] : undefined
  const parcelAt = order.shipping?.parcelStatusAt
  const parcel = parcelKey ? t(parcelKey, { date: parcelAt ? day(parcelAt) : "" }) : null
  const money = (minor: number) => formatMoney(minor, order.currency, locale)
  const codPending = order.status === "pending_payment" && order.paymentMethod === "cod"
  const transferPending = order.status === "pending_payment" && order.paymentMethod === "transfer"
  const payoneerPending = order.status === "pending_payment" && order.paymentMethod === "payoneer"
  const payoneer = payoneerPending ? order.payoneer : null
  const waiting = order.status === "pending_payment" && !codPending && !transferPending && !payoneerPending
  const stillWaiting = waiting && Date.now() - startedAt.current >= POLL_FOR_MS
  return (
    <div className="space-y-8">
      <div className="frame space-y-3 bg-card/70 p-6 text-center" role="status" aria-live="polite">
        <p className="font-display text-3xl text-gold">
          {codPending
            ? t("codTitle")
            : transferPending
              ? t("transferTitle")
              : payoneerPending
                ? t("payoneerTitle")
                : t(`status.${order.status}`)}
        </p>
        <p className="text-muted-foreground">
          {codPending
            ? t("codText")
            : transferPending
              ? t("transferText")
              : payoneerPending
                ? t(payoneer?.waitingForLink ? "payoneerWaiting" : "payoneerText")
                : stillWaiting
                  ? t("stillPending")
                  : t(`text.${order.status}`)}
        </p>
        {waiting && !stillWaiting && <Spinner className="mx-auto" />}
      </div>

      {order.shipping && (
        <section className="frame space-y-3 bg-card/70 p-6">
          <h2 className="text-3xl">{t("shipping")}</h2>
          <p>
            {order.shipping.shippedAt ? (
              t("shippedOn", {
                date: new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "Africa/Tunis" }).format(
                  new Date(order.shipping.shippedAt),
                ),
                carrier: `\u2066${carrierDisplayName(order.shipping)}\u2069`,
              })
            ) : (
              <bdi dir="ltr">{carrierDisplayName(order.shipping)}</bdi>
            )}
          </p>
          {parcel && (
            <p className="font-medium" data-testid="parcel-status">
              {parcel}
            </p>
          )}
          {order.shipping.trackingNumber && (
            <p className="text-sm">
              <span className="text-muted-foreground">{t("trackingNo")} </span>
              <span className="select-all font-mono" dir="ltr">
                {order.shipping.trackingNumber}
              </span>
            </p>
          )}
          {order.shipping.trackingUrl && (
            <a
              href={order.shipping.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              dir="ltr"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11")}
            >
              {t("trackParcel")}
            </a>
          )}
        </section>
      )}

      {transferPending && order.payBefore && (
        <p className="text-center text-gold">
          {t("payBefore", {
            date: new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "Africa/Tunis" }).format(
              new Date(order.payBefore),
            ),
          })}
        </p>
      )}

      {order.bank && (
        <section className="frame space-y-3 bg-card/70 p-6">
          <h2 className="text-3xl">{t("bankTitle")}</h2>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">{t("holder")}</dt>
            <dd>{order.bank.holder}</dd>
            <dt className="text-muted-foreground">{t("bank")}</dt>
            <dd>{order.bank.bank}</dd>
            {order.bank.address && (
              <>
                <dt className="text-muted-foreground">{t("bankAddress")}</dt>
                <dd dir="auto">{order.bank.address}</dd>
              </>
            )}
            {order.bank.rib && (
              <>
                <dt className="text-muted-foreground">{t("rib")}</dt>
                <dd className="select-all break-all font-mono" dir="ltr">
                  {order.bank.rib}
                </dd>
              </>
            )}
            {order.bank.iban && (
              <>
                <dt className="text-muted-foreground">{t("iban")}</dt>
                <dd className="select-all break-all font-mono" dir="ltr">
                  {order.bank.iban}
                </dd>
              </>
            )}
            {order.bank.bic && (
              <>
                <dt className="text-muted-foreground">{t("bic")}</dt>
                <dd className="select-all font-mono" dir="ltr">
                  {order.bank.bic}
                </dd>
              </>
            )}
            <dt className="text-muted-foreground">{t("reference")}</dt>
            <dd className="select-all font-heading" dir="ltr">
              {order.number}
            </dd>
          </dl>
        </section>
      )}

      {order.bankUsd && (
        <section className="frame space-y-3 bg-card/70 p-6">
          <h2 className="text-3xl">{t("usdTitle")}</h2>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">{t("holder")}</dt>
            <dd>{order.bankUsd.holder}</dd>
            <dt className="text-muted-foreground">{t("bank")}</dt>
            <dd>{order.bankUsd.bank}</dd>
            {order.bankUsd.address && (
              <>
                <dt className="text-muted-foreground">{t("bankAddress")}</dt>
                <dd dir="auto">{order.bankUsd.address}</dd>
              </>
            )}
            <dt className="text-muted-foreground">{t("accountNumber")}</dt>
            <dd className="select-all break-all font-mono" dir="ltr">
              {order.bankUsd.account}
            </dd>
            <dt className="text-muted-foreground">{t("routingNumber")}</dt>
            <dd className="select-all font-mono" dir="ltr">
              {order.bankUsd.routing}
            </dd>
            <dt className="text-muted-foreground">{t("swift")}</dt>
            <dd className="select-all font-mono" dir="ltr">
              {order.bankUsd.swift}
            </dd>
            <dt className="text-muted-foreground">{t("accountType")}</dt>
            <dd>{t(order.bankUsd.accountType)}</dd>
          </dl>
          <p className="text-muted-foreground text-sm">{t("usdNote")}</p>
        </section>
      )}

      {payoneer && (
        <section className="frame space-y-4 bg-card/70 p-6">
          <h2 className="text-3xl">{t("payoneerHeading")}</h2>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">{t("reference")}</dt>
            <dd className="select-all font-heading" dir="ltr">
              {order.number}
            </dd>
            <dt className="text-muted-foreground">{t("total")}</dt>
            <dd className="font-heading">{money(order.totalMinor)}</dd>
            {payoneer.receiverEmail && (
              <>
                <dt className="text-muted-foreground">{t("payoneerReceiver")}</dt>
                <dd className="select-all" dir="ltr">
                  {payoneer.receiverEmail}
                </dd>
              </>
            )}
          </dl>
          {payoneer.note && <p className="whitespace-pre-line text-sm">{payoneer.note}</p>}
          {payoneer.link && (
            <a
              href={payoneer.link}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ size: "lg" }), "h-11")}
            >
              {t("payoneerPay")}
            </a>
          )}
        </section>
      )}

      {transferPending && !order.bank && (
        <p className="frame bg-card/70 p-6 text-center text-muted-foreground">{t("bankMissing")}</p>
      )}

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
      {(order.status === "paid" || order.status === "fulfilled") && (
        <div className="text-center">
          <Link
            href={`/order/${number}/invoice?t=${encodeURIComponent(token)}`}
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11")}
          >
            {t("invoiceLink")}
          </Link>
        </div>
      )}
      <p className="text-center text-muted-foreground text-sm">{t("keepLink")}</p>
    </div>
  )
}
