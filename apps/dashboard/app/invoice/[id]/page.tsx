"use client"

import { useQuery } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { countryName, formatMoney } from "@workspace/sdk"
import { Button } from "@workspace/ui/components/button"
import { use } from "react"
import { formatDate } from "@/lib/copy"

export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: order, isError } = useQuery(orpc.admin.orders.get.queryOptions({ input: { id } }))
  if (isError) return <p className="p-8">Facture introuvable.</p>
  if (!order) return <p className="p-8 text-muted-foreground">Chargement…</p>
  const money = (minor: number) => formatMoney(minor, order.currency, "fr")
  return (
    <main className="mx-auto max-w-3xl space-y-8 bg-background p-8 print:p-0">
      <header className="flex justify-between gap-6">
        <div>
          <h1 className="text-4xl">Facture {order.number}</h1>
          <p className="text-muted-foreground">{formatDate(order.createdAt)}</p>
        </div>
        <div className="text-right">
          <p className="font-heading text-xl">Ceraghit Creation</p>
          <p className="text-muted-foreground">Sabri Ghit</p>
        </div>
      </header>
      <section>
        <p className="text-muted-foreground text-sm">Facturé à</p>
        <p>{order.customerName}</p>
        <p>{order.email}</p>
        <p>{order.phone}</p>
        <p>
          {order.address}, {[order.postalCode, order.city].filter(Boolean).join(" ")},{" "}
          {countryName(order.country, "fr")}
        </p>
      </section>
      <table className="w-full text-left">
        <thead className="border-b text-muted-foreground text-sm">
          <tr>
            <th className="py-2">Pièce</th>
            <th className="text-right">Qté</th>
            <th className="text-right">Prix</th>
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {order.items.map((item) => (
            <tr key={`${item.ref}-${item.title}`}>
              <td className="py-2">
                {item.ref} {item.title}
              </td>
              <td className="text-right tabular-nums">{item.quantity}</td>
              <td className="text-right tabular-nums">{money(item.unitMinor)}</td>
              <td className="text-right tabular-nums">{money(item.unitMinor * item.quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ml-auto max-w-xs space-y-1 tabular-nums">
        <div className="flex justify-between">
          <dt>Sous-total</dt>
          <dd>{money(order.subtotalMinor)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Livraison</dt>
          <dd>{money(order.shippingMinor)}</dd>
        </div>
        <div className="flex justify-between border-t pt-1 font-heading text-lg">
          <dt>Total</dt>
          <dd>{money(order.totalMinor)}</dd>
        </div>
      </dl>
      <p className="text-muted-foreground text-sm">
        {order.paymentMethod === "cod" ? "Paiement en espèces à la livraison. " : "Paiement en ligne. "}
        {order.paidAt ? `Payée le ${formatDate(order.paidAt)}.` : "Non encore payée."}
      </p>
      <Button className="h-11 print:hidden" onClick={() => window.print()}>
        Imprimer
      </Button>
    </main>
  )
}
