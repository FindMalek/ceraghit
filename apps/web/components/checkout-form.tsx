"use client"

import { useMutation } from "@tanstack/react-query"
import { errorMessage } from "@workspace/orpc/errors"
import { orpc } from "@workspace/orpc/react"
import { formatMoney, localeSchema, orderInputSchema, pick, type SHIPPING_COUNTRIES } from "@workspace/sdk"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"
import { useLocale, useTranslations } from "next-intl"
import { type FormEvent, useState } from "react"
import { toast } from "sonner"
import { Link } from "@/i18n/navigation"
import { lineKey, useCartStore } from "@/lib/cart-store"
import { rememberOrderToken } from "@/lib/order-tokens"
import { useHydrated } from "@/lib/use-hydrated"
import { useShippingQuote } from "@/lib/use-shipping-quote"
import { useCartTotals } from "./cart-summary"
import { CountrySelect } from "./country-select"
import { useCurrency } from "./currency-provider"
import { FormField } from "./form-field"
import { ShippingAmount, ShippingDetail, ShippingUnavailable } from "./shipping-quote-note"
import { TermsCheckbox } from "./terms-checkbox"

const FIELDS = ["customerName", "email", "phone", "city", "address", "postalCode", "note"] as const
type Field = (typeof FIELDS)[number]

export function CheckoutForm() {
  const t = useTranslations("checkout")
  const tc = useTranslations("cart")
  const locale = useLocale()
  const hydrated = useHydrated()
  const { currency } = useCurrency()
  const lines = useCartStore((s) => s.lines)
  const clear = useCartStore((s) => s.clear)
  const totals = useCartTotals(lines)
  const [country, setCountry] = useState<(typeof SHIPPING_COUNTRIES)[number]>("TN")
  const quote = useShippingQuote(
    lines.map((l) => ({ productId: l.productId, variantId: l.variantId ?? undefined, quantity: l.quantity })),
    country,
    currency,
  )
  const shipping = quote.data?.available ? quote.data.amountMinor : 0
  const canPay = quote.data?.available === true
  const [accepted, setAccepted] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<Field | "items" | "terms", string>>>({})

  const create = useMutation(
    orpc.public.orders.create.mutationOptions({
      onSuccess: (checkout) => {
        rememberOrderToken(checkout.number, checkout.token)
        clear()
        window.location.assign(checkout.payUrl)
      },
      onError: (error) => toast.error(errorMessage(error)),
    }),
  )

  if (!hydrated) return <div className="h-96" aria-busy />
  if (lines.length === 0) {
    return (
      <div className="frame flex flex-col items-center gap-4 bg-card/60 p-10 text-center">
        <p className="text-muted-foreground">{t("emptyCart")}</p>
        <Link href="/shop" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11")}>
          {t("backToShop")}
        </Link>
      </div>
    )
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const value = (key: Field): string => String(data.get(key) ?? "")
    const parsed = orderInputSchema.safeParse({
      items: lines.map((l) => ({ productId: l.productId, variantId: l.variantId ?? undefined, quantity: l.quantity })),
      currency,
      locale: localeSchema.catch("fr").parse(locale),
      customerName: value("customerName"),
      email: value("email"),
      phone: value("phone"),
      country,
      city: value("city"),
      address: value("address"),
      postalCode: value("postalCode") || undefined,
      note: value("note") || undefined,
    })
    if (!parsed.success || !accepted) {
      const next: typeof errors = {}
      for (const issue of parsed.success ? [] : parsed.error.issues) {
        const key = String(issue.path[0]) as Field | "items"
        next[key] ??= t.has(`errors.${key}`) ? t(`errors.${key}`) : t("failed")
      }
      if (!accepted) next.terms = t("errors.terms")
      setErrors(next)
      const first = Object.keys(next)[0] ?? ""
      const target =
        first === "terms" ? document.querySelector<HTMLElement>('[role="checkbox"]') : document.getElementById(first)
      target?.focus()
      return
    }
    setErrors({})
    create.mutate(parsed.data)
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-10 lg:grid-cols-[1fr_24rem]">
      <div className="space-y-10">
        <fieldset className="space-y-4">
          <legend className="mb-4 font-display text-3xl text-gold">{t("contact")}</legend>
          <FormField id="customerName" label={t("name")} autoComplete="name" error={errors.customerName} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="email"
              label={t("email")}
              type="email"
              autoComplete="email"
              inputMode="email"
              error={errors.email}
            />
            <FormField
              id="phone"
              label={t("phone")}
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              error={errors.phone}
            />
          </div>
        </fieldset>
        <fieldset className="space-y-4">
          <legend className="mb-4 font-display text-3xl text-gold">{t("delivery")}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <CountrySelect
              id="country"
              label={t("country")}
              value={country}
              onChange={setCountry}
              autoComplete="country"
            />
            <FormField id="city" label={t("city")} autoComplete="address-level2" error={errors.city} />
          </div>
          <FormField id="address" label={t("address")} autoComplete="street-address" error={errors.address} />
          <FormField id="postalCode" label={t("postalCode")} autoComplete="postal-code" className="sm:max-w-48" />
          <FormField id="note" label={t("note")} multiline placeholder={t("notePlaceholder")} />
        </fieldset>
      </div>

      <aside className="frame h-fit space-y-5 bg-card/70 p-6 lg:sticky lg:top-24">
        <h2 className="font-display text-3xl text-gold">{t("summary")}</h2>
        <ul className="space-y-2 text-sm">
          {lines.map((line) => (
            <li key={lineKey(line)} className="flex justify-between gap-3">
              <span>
                {pick(line.title, locale)}
                {line.variantLabel && (
                  <span className="text-muted-foreground"> ({pick(line.variantLabel, locale)})</span>
                )}{" "}
                <span className="text-muted-foreground">× {line.quantity}</span>
              </span>
              <span className="tabular-nums">
                {formatMoney(line.prices[currency] * line.quantity, currency, locale)}
              </span>
            </li>
          ))}
        </ul>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{tc("subtotal")}</dt>
            <dd className="tabular-nums">{formatMoney(totals.subtotal, currency, locale)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">{tc("shipping")}</dt>
            <dd>
              <ShippingAmount quote={quote} />
            </dd>
          </div>
          <div className="flex justify-between border-border border-t pt-3 font-heading text-lg">
            <dt>{tc("total")}</dt>
            <dd className="tabular-nums">{formatMoney(totals.subtotal + shipping, currency, locale)}</dd>
          </div>
        </dl>
        <ShippingDetail quote={quote} />
        <ShippingUnavailable quote={quote} />
        <p className="text-muted-foreground text-xs">
          {t("payIn", { currency: currency === "TND" ? "TND (DT)" : "EUR (€)" })}
        </p>
        {errors.items && (
          <p role="alert" className="text-destructive text-sm">
            {errors.items}
          </p>
        )}
        <TermsCheckbox checked={accepted} onChange={setAccepted} error={errors.terms} />
        <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={create.isPending || !canPay}>
          {create.isPending ? (
            <>
              <Spinner /> {t("paying")}
            </>
          ) : (
            t("pay", { total: formatMoney(totals.subtotal + shipping, currency, locale) })
          )}
        </Button>
        <p className="text-muted-foreground text-xs">{t("secure")}</p>
      </aside>
    </form>
  )
}
