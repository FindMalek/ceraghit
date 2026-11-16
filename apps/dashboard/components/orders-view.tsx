"use client"

import {
  CheckIcon,
  CopyIcon,
  EnvelopeSimpleIcon,
  MagnifyingGlassIcon,
  PhoneIcon,
  WhatsappLogoIcon,
} from "@phosphor-icons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { carrierDisplayName, countryName, formatMoney, type PaymentMethod } from "@workspace/sdk"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { showError } from "@workspace/ui/components/error-banner"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@workspace/ui/components/input-group"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import { cn } from "@workspace/ui/lib/utils"
import { useEffect, useState } from "react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { DownloadInvoiceButton } from "@/components/download-invoice-button"
import { ExportOrdersDialog } from "@/components/export-orders-dialog"
import { MANUAL_METHOD_LABEL, MarkPaidDialog } from "@/components/mark-paid-dialog"
import { PageBody, PageHeader } from "@/components/page-header"
import { EmptyState, ErrorState, LoadingRows } from "@/components/query-state"
import { ShipOrderDialog } from "@/components/ship-order-dialog"
import { SimpleSelect } from "@/components/simple-select"
import { HoldBadge, OrderStatusBadge } from "@/components/status-badge"
import { formatDate, formatDayYear, ORDER_STATUS, PAYMENT_LABEL, PAYMENT_PROVIDER, PAYMENT_SHORT } from "@/lib/copy"
import { errorMessage } from "@/lib/errors"

type Status = "pending_payment" | "paid" | "fulfilled" | "cancelled" | "refunded"
type Filter = "all" | Status
type Order = NonNullable<ReturnType<typeof useOrders>["data"]>[number]
type Target = Exclude<Status, "pending_payment">

const FILTERS = [
  { value: "all" as const, label: "Toutes les commandes" },
  ...Object.entries(ORDER_STATUS).map(([value, label]) => ({ value: value as Status, label })),
]

interface Action {
  to: Target
  label: string
  destructive?: boolean
  confirm: string
}

/** Only moves the api actually performs: cancelling or refunding returns the pieces to stock. */
function actionsFor(status: Status, method: PaymentMethod): Action[] {
  if (status === "pending_payment" && method === "cod") {
    return [
      {
        to: "fulfilled",
        label: "Marquer expédiée",
        confirm: "La commande est expédiée et comptée dans les ventes. Le client paie en espèces à la livraison.",
      },
      {
        to: "cancelled",
        label: "Annuler",
        destructive: true,
        confirm: "La commande est annulée et les pièces retournent en stock.",
      },
    ]
  }
  if (status === "pending_payment") {
    return [
      {
        to: "paid",
        label: "Marquer payée",
        confirm: "À utiliser pour un virement, un lien Payoneer ou un paiement en main propre reçu hors du site.",
      },
      {
        to: "cancelled",
        label: "Annuler",
        destructive: true,
        confirm: "La commande est annulée et les pièces retournent en stock.",
      },
    ]
  }
  if (status === "paid") {
    return [
      { to: "fulfilled", label: "Marquer expédiée", confirm: "La commande est marquée comme expédiée." },
      {
        to: "cancelled",
        label: "Annuler",
        destructive: true,
        confirm: "La commande est annulée et les pièces retournent en stock. Pensez à rembourser le client.",
      },
      {
        to: "refunded",
        label: "Rembourser",
        destructive: true,
        confirm:
          "La commande est marquée remboursée et les pièces retournent en stock. Le remboursement lui-même se fait chez Konnect.",
      },
    ]
  }
  if (status === "fulfilled") {
    return [
      {
        to: "refunded",
        label: "Rembourser",
        destructive: true,
        confirm:
          "La commande est marquée remboursée. Les pièces ne retournent pas en stock puisqu'elles ont été expédiées. Le remboursement lui-même se fait hors du site.",
      },
    ]
  }
  return []
}

function useOrders(input: { status?: Status; q?: string; limit: number }) {
  return useQuery(orpc.admin.orders.list.queryOptions({ input }))
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  )
}

const GATEWAY_AUDIT_LABEL: Record<string, string> = {
  gateway_mismatch: "Paiement Konnect incohérent : à vérifier dans votre espace Konnect",
  hold_expired: "Annulée automatiquement : délai de paiement dépassé",
  late_payment: "Paiement Konnect reçu après l'annulation : à rembourser ou restaurer à la main",
}

function History({ orderId }: { orderId: string }) {
  const audit = useQuery(orpc.admin.orders.audit.queryOptions({ input: { id: orderId } }))
  if (!audit.data?.length) return null
  return (
    <section>
      <h2 className="mb-1 font-heading text-2xl">Historique</h2>
      <ul className="flex flex-col divide-y">
        {audit.data.map((row) => {
          const method = row.method
            ? (MANUAL_METHOD_LABEL[row.method as keyof typeof MANUAL_METHOD_LABEL] ?? row.method)
            : null
          const detail = [method, row.reference ? `réf. ${row.reference}` : null].filter(Boolean).join(", ")
          const gatewayIssue = GATEWAY_AUDIT_LABEL[row.action]
          if (gatewayIssue) {
            return (
              <li key={row.id} className="py-2">
                <span className="block text-muted-foreground text-sm">{formatDate(row.createdAt)}</span>
                {gatewayIssue}
                {row.note && <span className="block text-muted-foreground">{row.note}</span>}
              </li>
            )
          }
          return (
            <li key={row.id} className="py-2">
              <span className="block text-muted-foreground text-sm">{formatDate(row.createdAt)}</span>
              {row.adminName ?? "Démo"} : {ORDER_STATUS[row.fromStatus].toLowerCase()} →{" "}
              {ORDER_STATUS[row.toStatus].toLowerCase()}
              {detail && ` (${detail})`}
              {row.note && <span className="block text-muted-foreground">« {row.note} »</span>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function OrderSheet({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<Action | null>(null)
  const [editTracking, setEditTracking] = useState(false)
  const [copied, setCopied] = useState(false)
  const setStatus = useMutation(
    orpc.admin.orders.setStatus.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.admin.orders.key() })
        queryClient.invalidateQueries({ queryKey: orpc.admin.overview.key() })
        queryClient.invalidateQueries({ queryKey: orpc.admin.products.key() })
        onClose()
      },
      onError: (error) => showError(errorMessage(error)),
    }),
  )

  return (
    <>
      <Sheet open={order !== null} onOpenChange={(open) => !open && onClose()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {order && (
            <>
              <SheetHeader>
                <SheetTitle className="text-3xl tabular-nums">{order.number}</SheetTitle>
                <SheetDescription>
                  {formatDate(order.createdAt)} · <OrderStatusBadge status={order.status} /> <HoldBadge order={order} />
                </SheetDescription>
              </SheetHeader>
              {order.holdExpiresAt && order.holdWarning && (
                <p className="mx-4 mb-4 rounded-md border border-ochre/60 bg-ochre/10 p-3 text-sm">
                  Sans paiement d'ici le {formatDayYear(order.holdExpiresAt)}, la commande sera annulée et les pièces
                  remises en vente.
                </p>
              )}
              <div className="flex flex-col gap-6 px-4 pb-4">
                <section>
                  <h2 className="mb-1 font-heading text-2xl">Client</h2>
                  <p>{order.customerName}</p>
                  <p>
                    <a className="underline underline-offset-4" href={`mailto:${order.email}`}>
                      {order.email}
                    </a>
                  </p>
                  <p className="tabular-nums">{order.phone}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a
                      href={`tel:${order.phone.replace(/\s/g, "")}`}
                      className={cn(buttonVariants({ variant: "outline" }), "h-11")}
                    >
                      <PhoneIcon /> Appeler
                    </a>
                    <a
                      href={`https://wa.me/${order.phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(buttonVariants({ variant: "outline" }), "h-11")}
                    >
                      <WhatsappLogoIcon /> WhatsApp
                    </a>
                    <a href={`mailto:${order.email}`} className={cn(buttonVariants({ variant: "outline" }), "h-11")}>
                      <EnvelopeSimpleIcon /> Écrire
                    </a>
                  </div>
                  <p className="mt-2 text-muted-foreground">
                    {order.address}
                    <br />
                    {[order.postalCode, order.city].filter(Boolean).join(" ")}, {countryName(order.country, "fr")}
                  </p>
                  {order.note && <p className="frame mt-2 p-2">« {order.note} »</p>}
                </section>
                <section>
                  <h2 className="mb-1 font-heading text-2xl">Pièces</h2>
                  <ul className="flex flex-col divide-y">
                    {order.items.map((item) => (
                      <li key={`${item.ref}-${item.title}`} className="flex justify-between gap-3 py-2">
                        <span>
                          <span className="text-muted-foreground tabular-nums">{item.ref}</span> {item.title} ×{" "}
                          {item.quantity}
                        </span>
                        <span className="tabular-nums">
                          {formatMoney(item.unitMinor * item.quantity, order.currency, "fr")}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <dl className="mt-2 border-t pt-2 tabular-nums">
                    <Line label="Sous-total" value={formatMoney(order.subtotalMinor, order.currency, "fr")} />
                    <Line label="Livraison" value={formatMoney(order.shippingMinor, order.currency, "fr")} />
                    <Line
                      label="Total"
                      value={<strong>{formatMoney(order.totalMinor, order.currency, "fr")}</strong>}
                    />
                  </dl>
                </section>
                <section>
                  <h2 className="mb-1 font-heading text-2xl">Paiement</h2>
                  <dl>
                    <Line label="Mode" value={PAYMENT_LABEL[order.paymentMethod]} />
                    {order.paymentMethod === "online" && (
                      <>
                        <Line
                          label="Passerelle"
                          value={
                            order.paymentProvider
                              ? (PAYMENT_PROVIDER[order.paymentProvider] ?? order.paymentProvider)
                              : "—"
                          }
                        />
                        <Line
                          label="Référence"
                          value={<span className="break-all tabular-nums">{order.paymentRef ?? "—"}</span>}
                        />
                      </>
                    )}
                    <Line label="Payée le" value={order.paidAt ? formatDate(order.paidAt) : "—"} />
                  </dl>
                </section>
                {order.status === "fulfilled" && (
                  <section>
                    <h2 className="mb-1 font-heading text-2xl">Livraison</h2>
                    {order.shipping ? (
                      <dl>
                        <Line label="Transporteur" value={carrierDisplayName(order.shipping)} />
                        {order.shipping.trackingNumber && (
                          <Line
                            label="N° de suivi"
                            value={
                              <span className="inline-flex items-center gap-1">
                                <span className="break-all tabular-nums">{order.shipping.trackingNumber}</span>
                                <Button
                                  variant="ghost"
                                  className="size-11"
                                  aria-label={copied ? "Numéro copié" : "Copier le numéro de suivi"}
                                  onClick={() => {
                                    navigator.clipboard?.writeText(order.shipping!.trackingNumber!)
                                    setCopied(true)
                                    setTimeout(() => setCopied(false), 1500)
                                  }}
                                >
                                  {copied ? <CheckIcon /> : <CopyIcon />}
                                </Button>
                              </span>
                            }
                          />
                        )}
                        {order.shipping.shippedAt && (
                          <Line label="Expédiée le" value={formatDate(order.shipping.shippedAt)} />
                        )}
                      </dl>
                    ) : (
                      <p className="text-muted-foreground">Expédiée, sans suivi enregistré.</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {order.shipping?.trackingUrl && (
                        <a
                          href={order.shipping.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(buttonVariants({ variant: "outline" }), "h-11")}
                        >
                          Suivre le colis
                        </a>
                      )}
                      <Button variant="outline" className="h-11" onClick={() => setEditTracking(true)}>
                        Modifier le suivi
                      </Button>
                    </div>
                  </section>
                )}
                <History orderId={order.id} />
              </div>
              <SheetFooter className="sticky bottom-0 flex-row flex-wrap justify-end border-t bg-background/95 backdrop-blur">
                <a
                  href={`/invoice/${order.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(buttonVariants({ variant: "outline" }), "h-11")}
                >
                  Facture
                </a>
                {(order.status === "paid" || order.status === "fulfilled") && (
                  <DownloadInvoiceButton orderId={order.id} />
                )}
                {actionsFor(order.status, order.paymentMethod).map((action) => (
                  <Button
                    key={action.to}
                    variant={action.destructive ? "outline" : "default"}
                    className="h-11"
                    onClick={() => setPending(action)}
                  >
                    {action.label}
                  </Button>
                ))}
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
      {order && (
        <ShipOrderDialog
          order={order}
          editing={editTracking}
          current={editTracking ? order.shipping : null}
          open={pending?.to === "fulfilled" || editTracking}
          onOpenChange={(open) => {
            if (!open) {
              setPending(null)
              setEditTracking(false)
            }
          }}
          onDone={onClose}
        />
      )}
      {order && (
        <MarkPaidDialog
          order={order}
          open={pending?.to === "paid"}
          onOpenChange={(open) => !open && setPending(null)}
          onDone={onClose}
        />
      )}
      <ConfirmDialog
        open={pending !== null && pending.to !== "paid" && pending.to !== "fulfilled"}
        onOpenChange={(open) => !open && setPending(null)}
        title={`${pending?.label ?? ""} ?`}
        description={pending?.confirm ?? ""}
        confirmLabel={pending?.label ?? "Confirmer"}
        destructive={pending?.destructive}
        onConfirm={() => order && pending && setStatus.mutate({ id: order.id, status: pending.to })}
      />
    </>
  )
}

export function OrdersView({ initialQuery = "" }: { initialQuery?: string }) {
  const [status, setStatus] = useState<Filter>("all")
  const [q, setQ] = useState(initialQuery)
  const [search, setSearch] = useState(initialQuery)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setSearch(q), 300)
    return () => clearTimeout(timer)
  }, [q])

  const [limit, setLimit] = useState(200)
  const orders = useOrders({ status: status === "all" ? undefined : status, q: search || undefined, limit })
  const rows = orders.data ?? []
  const current = rows.find((order) => order.id === selected) ?? null

  return (
    <>
      <PageHeader
        title="Commandes"
        description="Chaque commande est payée dans sa devise, dinars ou euros."
        actions={<ExportOrdersDialog />}
      />
      <PageBody>
        <div className="flex flex-col gap-3 md:flex-row">
          <InputGroup className="h-11 md:max-w-sm">
            <InputGroupAddon>
              <MagnifyingGlassIcon />
            </InputGroupAddon>
            <InputGroupInput placeholder="Numéro, nom ou email" value={q} onChange={(e) => setQ(e.target.value)} />
          </InputGroup>
          <SimpleSelect
            label="Filtrer par statut"
            value={status}
            onChange={setStatus}
            options={FILTERS}
            className="h-11 w-full md:w-64"
          />
        </div>

        {orders.isPending && <LoadingRows />}
        {orders.isError && <ErrorState error={orders.error} onRetry={() => orders.refetch()} />}
        {orders.data && rows.length === 0 && (
          <EmptyState title="Aucune commande" description="Aucune commande ne correspond à ces filtres." />
        )}

        {rows.length > 0 && (
          <>
            <ul className="flex flex-col gap-3 md:hidden">
              {rows.map((order) => (
                <li key={order.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(order.id)}
                    className="frame flex w-full flex-col gap-1 bg-card/70 p-3 text-left"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="whitespace-nowrap text-lg tabular-nums">{order.number}</span>
                      <span className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
                        <HoldBadge order={order} />
                        <OrderStatusBadge status={order.status} />
                      </span>
                    </span>
                    <span>{order.customerName}</span>
                    <span className="flex justify-between text-muted-foreground text-sm">
                      <span>
                        {formatDate(order.createdAt)} · {PAYMENT_SHORT[order.paymentMethod]}
                      </span>
                      <span className="text-foreground tabular-nums">
                        {formatMoney(order.totalMinor, order.currency, "fr")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="frame hidden bg-card/70 md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numéro</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Pays</TableHead>
                    <TableHead className="text-right">Pièces</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Paiement</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((order) => (
                    <TableRow key={order.id} className="cursor-pointer" onClick={() => setSelected(order.id)}>
                      <TableCell className="tabular-nums">{order.number}</TableCell>
                      <TableCell>{formatDate(order.createdAt)}</TableCell>
                      <TableCell>{order.customerName}</TableCell>
                      <TableCell>{countryName(order.country, "fr")}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {order.items.reduce((n, i) => n + i.quantity, 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(order.totalMinor, order.currency, "fr")}
                      </TableCell>
                      <TableCell>{PAYMENT_SHORT[order.paymentMethod]}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          <OrderStatusBadge status={order.status} />
                          <HoldBadge order={order} />
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {orders.data && orders.data.length >= limit && limit < 1000 && (
              <Button variant="outline" className="h-11 w-full sm:w-fit" onClick={() => setLimit((n) => n + 200)}>
                Afficher plus de commandes
              </Button>
            )}
          </>
        )}
      </PageBody>
      <OrderSheet order={current} onClose={() => setSelected(null)} />
    </>
  )
}
