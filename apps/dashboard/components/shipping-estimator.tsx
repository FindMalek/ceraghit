"use client"

import { MinusIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react"
import { useQuery } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import {
  type Currency,
  countryName,
  estimateShipping,
  formatMoney,
  type Product,
  pick,
  SHIPPING_COUNTRIES,
  type ShippingEstimate,
  type ShippingRates,
} from "@workspace/sdk"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import Link from "next/link"
import { useMemo, useState } from "react"
import { EmptyState, ErrorState, LoadingRows } from "@/components/query-state"
import { SimpleSelect } from "@/components/simple-select"
import { CURRENCY_LABEL } from "@/lib/copy"

interface Line {
  productId: string
  quantity: number
}

const COUNTRY_OPTIONS = [...SHIPPING_COUNTRIES]
  .map((code) => ({ value: code as string, label: countryName(code, "fr") }))
  .sort((a, b) => a.label.localeCompare(b.label, "fr"))

const REASON = {
  "too-heavy": "Trop lourd pour un colis : livraison sur devis.",
  "too-long": "Trop long pour un colis : livraison sur devis.",
  "no-zone": "Aucune zone ne couvre ce pays.",
} as const

const kg = (value: number): string => `${value.toFixed(2).replace(".", ",")} kg`

/** A country that belongs to the zone, used to price the same cart in every zone. */
function sampleCountry(rates: ShippingRates, zoneIndex: number): string {
  const zone = rates.zones[zoneIndex]
  const own = zone?.countries.find((c) => c !== "*")
  if (own) return own
  const covered = new Set(rates.zones.flatMap((z) => z.countries))
  return SHIPPING_COUNTRIES.find((c) => !covered.has(c)) ?? "US"
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2 last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  )
}

function Result({ estimate, currency }: { estimate: ShippingEstimate; currency: Currency }) {
  return (
    <section className="frame flex flex-col gap-3 bg-card/60 p-4" aria-live="polite">
      <h2 className="font-heading text-2xl">Résultat</h2>
      <p className="font-heading text-4xl text-gold tabular-nums">
        {estimate.available ? formatMoney(estimate.amountMinor, currency, "fr") : "Sur devis"}
      </p>
      {!estimate.available && estimate.reason && <p className="text-muted-foreground">{REASON[estimate.reason]}</p>}
      <dl>
        <Row label="Zone" value={estimate.zoneName ?? "Aucune"} />
        <Row label="Poids emballé" value={kg(estimate.actualKg)} />
        <Row label="Poids volumétrique" value={kg(estimate.volumetricKg)} />
        <Row label="Poids facturé" value={<strong>{kg(estimate.chargeableKg)}</strong>} />
      </dl>
    </section>
  )
}

function Estimator({ products, rates }: { products: Product[]; rates: ShippingRates }) {
  const [lines, setLines] = useState<Line[]>([])
  const [country, setCountry] = useState("TN")
  const [currency, setCurrency] = useState<Currency>("TND")
  const [search, setSearch] = useState("")

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products
      .filter((p) => !lines.some((l) => l.productId === p.id))
      .filter((p) => !q || p.ref.toLowerCase().includes(q) || pick(p.title, "fr").toLowerCase().includes(q))
      .slice(0, 6)
  }, [products, lines, search])

  const items = lines.flatMap((line) => {
    const product = byId.get(line.productId)
    return product ? [{ ...product, quantity: line.quantity }] : []
  })
  const estimate = items.length ? estimateShipping(rates, items, country, currency) : null
  const setQuantity = (productId: string, quantity: number) =>
    setLines((list) =>
      list.map((l) => (l.productId === productId ? { ...l, quantity: Math.min(20, Math.max(1, quantity)) } : l)),
    )

  return (
    <div className="grid gap-6 px-4 py-6 md:px-6 lg:grid-cols-[1fr_minmax(0,24rem)]">
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-2xl">Pièces</h2>
          <Field>
            <FieldLabel htmlFor="est-search">Chercher une pièce par nom ou référence</FieldLabel>
            <Input
              id="est-search"
              className="h-11"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="0200, lampe, medusa…"
            />
          </Field>
          <ul className="flex flex-col divide-y">
            {matches.map((product) => (
              <li key={product.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <span className="text-muted-foreground tabular-nums">{product.ref}</span> {pick(product.title, "fr")}
                  <span className="ml-2 text-muted-foreground text-sm tabular-nums">
                    {product.weightGrams / 1000} kg · {product.lengthCm}×{product.widthCm}×{product.heightCm} cm
                  </span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => setLines((list) => [...list, { productId: product.id, quantity: 1 }])}
                >
                  <PlusIcon /> Ajouter
                </Button>
              </li>
            ))}
            {matches.length === 0 && <li className="py-2 text-muted-foreground">Aucune autre pièce trouvée.</li>}
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-2xl">Dans le colis</h2>
          {lines.length === 0 ? (
            <p className="text-muted-foreground">Ajoutez au moins une pièce pour voir le prix.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <span className="text-muted-foreground tabular-nums">{item.ref}</span> {pick(item.title, "fr")}
                  </span>
                  <span className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-lg"
                      aria-label="Moins"
                      onClick={() => setQuantity(item.id, item.quantity - 1)}
                    >
                      <MinusIcon />
                    </Button>
                    <span className="w-6 text-center tabular-nums">{item.quantity}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-lg"
                      aria-label="Plus"
                      onClick={() => setQuantity(item.id, item.quantity + 1)}
                    >
                      <PlusIcon />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-lg"
                      aria-label="Retirer"
                      onClick={() => setLines((list) => list.filter((l) => l.productId !== item.id))}
                    >
                      <TrashIcon />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="est-country">Pays de livraison</FieldLabel>
            <SimpleSelect id="est-country" value={country} onChange={setCountry} options={COUNTRY_OPTIONS} />
          </Field>
          <Field>
            <FieldLabel htmlFor="est-currency">Devise du client</FieldLabel>
            <SimpleSelect
              id="est-currency"
              value={currency}
              onChange={setCurrency}
              options={(["TND", "EUR"] as const).map((value) => ({ value, label: CURRENCY_LABEL[value] }))}
            />
          </Field>
        </section>
      </div>

      <aside className="flex flex-col gap-6">
        {estimate ? (
          <>
            <Result estimate={estimate} currency={currency} />
            <section className="flex flex-col gap-2">
              <h2 className="font-heading text-2xl">Le même colis, partout</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zone</TableHead>
                    <TableHead>Exemple</TableHead>
                    <TableHead className="text-right">Prix</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rates.zones.map((zone, index) => {
                    const sample = sampleCountry(rates, index)
                    const row = estimateShipping(rates, items, sample, currency)
                    return (
                      <TableRow key={zone.id}>
                        <TableCell>{zone.name}</TableCell>
                        <TableCell className="text-muted-foreground">{countryName(sample, "fr")}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.available ? (
                            formatMoney(row.amountMinor, currency, "fr")
                          ) : (
                            <Badge variant="outline">Devis</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </section>
          </>
        ) : (
          <EmptyState title="Pas encore de colis" description="Choisissez une pièce pour estimer la livraison." />
        )}
        <p className="text-muted-foreground text-sm">
          Estimation d'après la grille des{" "}
          <Link href="/settings" className="underline underline-offset-4">
            réglages
          </Link>
          , qui reste à confirmer avec les tarifs réels des transporteurs.
        </p>
      </aside>
    </div>
  )
}

export function ShippingEstimator() {
  const settings = useQuery(orpc.admin.settings.get.queryOptions())
  const products = useQuery(orpc.admin.products.list.queryOptions({ input: {} }))
  if (settings.isPending || products.isPending) {
    return (
      <div className="px-4 py-6 md:px-6">
        <LoadingRows rows={4} />
      </div>
    )
  }
  if (settings.isError || products.isError) {
    return (
      <div className="p-4 md:p-6">
        <ErrorState
          error={settings.error ?? products.error}
          onRetry={() => {
            settings.refetch()
            products.refetch()
          }}
        />
      </div>
    )
  }
  return <Estimator products={products.data} rates={settings.data.shippingRates} />
}
