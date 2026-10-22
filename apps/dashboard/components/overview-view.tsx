"use client"

import { useQuery } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { type Currency, countryName, formatMoney } from "@workspace/sdk"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import Link from "next/link"
import { useState } from "react"
import { type DayPoint, RevenueChart } from "@/components/overview-charts"
import { PageBody, PageHeader } from "@/components/page-header"
import { ErrorState } from "@/components/query-state"
import { SimpleSelect } from "@/components/simple-select"

const RANGES = [
  { value: "7", label: "7 derniers jours" },
  { value: "30", label: "30 derniers jours" },
  { value: "90", label: "90 derniers jours" },
]

const dayKey = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" }).format(date)

/** Days without a sale still get a point, so the chart shows the real shape of the period. */
function fillDays(days: number, rows: DayPoint[]): DayPoint[] {
  const byDay = new Map(rows.map((row) => [row.day, row]))
  return Array.from({ length: days }, (_, i) => {
    const day = dayKey(new Date(Date.now() - (days - 1 - i) * 864e5))
    return byDay.get(day) ?? { day, TND: 0, EUR: 0, orders: 0 }
  })
}

function Stat({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
  const body = (
    <Card className="frame h-full bg-card/70">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-heading text-3xl tabular-nums">{value}</CardTitle>
        {hint && <CardDescription>{hint}</CardDescription>}
      </CardHeader>
    </Card>
  )
  return href ? (
    <Link href={href} className="block outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
      {body}
    </Link>
  ) : (
    body
  )
}

export function OverviewView() {
  const [days, setDays] = useState("30")
  const stats = useQuery(orpc.admin.overview.queryOptions({ input: { days: Number(days) } }))
  const data = stats.data

  return (
    <>
      <PageHeader
        title="Vue d'ensemble"
        description="Les ventes de la boutique."
        actions={<SimpleSelect value={days} onChange={setDays} options={RANGES} className="h-11 w-56" />}
      />
      <PageBody>
        {stats.isError && <ErrorState error={stats.error} onRetry={() => stats.refetch()} />}
        {stats.isPending && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={`s-${i}`} className="h-28" />
            ))}
          </div>
        )}
        {data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Ventes en dinars"
                value={formatMoney(data.revenue.TND, "TND", "fr")}
                hint="Commandes payées en DT"
              />
              <Stat
                label="Ventes en euros"
                value={formatMoney(data.revenue.EUR, "EUR", "fr")}
                hint="Commandes payées en €"
              />
              <Stat label="Commandes payées" value={String(data.paidOrders)} />
              <Stat label="En attente de paiement" value={String(data.pendingOrders)} href="/orders" />
              <Stat label="Panier moyen (DT)" value={formatMoney(data.averageOrder.TND, "TND", "fr")} />
              <Stat label="Panier moyen (€)" value={formatMoney(data.averageOrder.EUR, "EUR", "fr")} />
              <Stat
                label="Nouvelles demandes"
                value={String(data.newRequests)}
                hint="Pièces uniques à traiter"
                href="/requests"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {(["TND", "EUR"] as Currency[]).map((currency) => (
                <Card key={currency} className="frame bg-card/70">
                  <CardHeader>
                    <CardTitle className="text-2xl">
                      Ventes par jour, {currency === "TND" ? "dinars" : "euros"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RevenueChart currency={currency} data={fillDays(data.days, data.byDay)} />
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="frame bg-card/70">
                <CardHeader>
                  <CardTitle className="text-2xl">Pièces les plus vendues</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.topProducts.length === 0 ? (
                    <p className="text-muted-foreground">Aucune vente sur la période.</p>
                  ) : (
                    <ol className="flex flex-col gap-2">
                      {data.topProducts.map((product) => (
                        <li key={product.ref} className="flex items-baseline justify-between gap-3">
                          <span className="truncate">
                            <span className="text-muted-foreground tabular-nums">{product.ref}</span> {product.title}
                          </span>
                          <span className="tabular-nums">{product.quantity}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </CardContent>
              </Card>

              <Card className="frame bg-card/70">
                <CardHeader>
                  <CardTitle className="text-2xl">Commandes par pays</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.byCountry.length === 0 ? (
                    <p className="text-muted-foreground">Aucune vente sur la période.</p>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {data.byCountry.map((row) => (
                        <li key={row.country} className="flex flex-col gap-1">
                          <div className="flex justify-between">
                            <span>{countryName(row.country, "fr")}</span>
                            <span className="tabular-nums">{row.orders}</span>
                          </div>
                          <div className="h-1.5 bg-muted">
                            <div
                              className="h-full bg-gold"
                              style={{ width: `${(row.orders / (data.byCountry[0]?.orders || 1)) * 100}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card className="frame bg-card/70">
                <CardHeader>
                  <CardTitle className="text-2xl">Stock faible</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.lowStock.length === 0 ? (
                    <p className="text-muted-foreground">Rien à réapprovisionner.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {data.lowStock.map((product) => (
                        <li key={product.id}>
                          <Link
                            href={`/products/${product.id}`}
                            className="flex items-baseline justify-between gap-3 py-1 hover:text-primary"
                          >
                            <span className="truncate">
                              <span className="text-muted-foreground tabular-nums">{product.ref}</span> {product.title}
                            </span>
                            <span className={`tabular-nums ${product.stock === 0 ? "text-destructive" : ""}`}>
                              {product.stock}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </PageBody>
    </>
  )
}
