"use client"

import { MagnifyingGlassIcon } from "@phosphor-icons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { errorMessage } from "@workspace/orpc/errors"
import { orpc } from "@workspace/orpc/react"
import { countryName, formatMoney } from "@workspace/sdk"
import { Button } from "@workspace/ui/components/button"
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
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { PageBody, PageHeader } from "@/components/page-header"
import { EmptyState, ErrorState, LoadingRows } from "@/components/query-state"
import { SimpleSelect } from "@/components/simple-select"
import { OrderStatusBadge } from "@/components/status-badge"
import { formatDate, ORDER_STATUS } from "@/lib/copy"

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
function actionsFor(status: Status): Action[] {
  if (status === "pending_payment") {
    return [
      {
        to: "paid",
        label: "Marquer payée",
        confirm: "À utiliser pour un virement ou un paiement en main propre reçu hors du site.",
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
  return []
}

function useOrders(input: { status?: Status; q?: string }) {
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

function OrderSheet({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<Action | null>(null)
  const setStatus = useMutation(
    orpc.admin.orders.setStatus.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.admin.orders.key() })
        queryClient.invalidateQueries({ queryKey: orpc.admin.overview.key() })
        queryClient.invalidateQueries({ queryKey: orpc.admin.products.key() })
        toast.success("Commande mise à jour.")
        onClose()
      },
      onError: (error) => toast.error(errorMessage(error)),
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
                  {formatDate(order.createdAt)} · <OrderStatusBadge status={order.status} />
                </SheetDescription>
              </SheetHeader>
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
                    <Line label="Passerelle" value={order.paymentProvider ?? "—"} />
                    <Line
                      label="Référence"
                      value={<span className="break-all tabular-nums">{order.paymentRef ?? "—"}</span>}
                    />
                    <Line label="Payée le" value={order.paidAt ? formatDate(order.paidAt) : "—"} />
                  </dl>
                </section>
              </div>
              {actionsFor(order.status).length > 0 && (
                <SheetFooter className="sticky bottom-0 flex-row flex-wrap justify-end border-t bg-background/95 backdrop-blur">
                  {actionsFor(order.status).map((action) => (
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
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={pending !== null}
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

export function OrdersView() {
  const [status, setStatus] = useState<Filter>("all")
  const [q, setQ] = useState("")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setSearch(q), 300)
    return () => clearTimeout(timer)
  }, [q])

  const orders = useOrders({ status: status === "all" ? undefined : status, q: search || undefined })
  const rows = orders.data ?? []
  const current = rows.find((order) => order.id === selected) ?? null

  return (
    <>
      <PageHeader title="Commandes" description="Chaque commande est payée dans sa devise, dinars ou euros." />
      <PageBody>
        <div className="flex flex-col gap-3 md:flex-row">
          <InputGroup className="h-11 md:max-w-sm">
            <InputGroupAddon>
              <MagnifyingGlassIcon />
            </InputGroupAddon>
            <InputGroupInput placeholder="Numéro, nom ou email" value={q} onChange={(e) => setQ(e.target.value)} />
          </InputGroup>
          <SimpleSelect value={status} onChange={setStatus} options={FILTERS} className="h-11 w-full md:w-64" />
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
                      <span className="text-lg tabular-nums">{order.number}</span>
                      <OrderStatusBadge status={order.status} />
                    </span>
                    <span>{order.customerName}</span>
                    <span className="flex justify-between text-muted-foreground text-sm">
                      <span>{formatDate(order.createdAt)}</span>
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
                      <TableCell>
                        <OrderStatusBadge status={order.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </PageBody>
      <OrderSheet order={current} onClose={() => setSelected(null)} />
    </>
  )
}
