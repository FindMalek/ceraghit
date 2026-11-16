"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { CARRIER_IDS, CARRIERS, type CarrierId, trackingUrlFor } from "@workspace/sdk"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { showError } from "@workspace/ui/components/error-banner"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { useEffect, useState } from "react"
import { SimpleSelect } from "@/components/simple-select"
import { errorMessage } from "@/lib/errors"

const OPTIONS = CARRIER_IDS.map((value) => ({ value, label: CARRIERS[value].label }))

export interface ShippingValues {
  carrier: CarrierId
  carrierName: string | null
  trackingNumber: string | null
  trackingUrl: string | null
}

export function ShipOrderDialog({
  order,
  current,
  editing = false,
  open,
  onOpenChange,
  onDone,
}: {
  order: {
    id: string
    number: string
    customerName: string
    paymentMethod: "online" | "cod" | "transfer"
    status: string
  }
  /** Edit mode: the order already shipped, only the tracking changes. */
  editing?: boolean
  current?: ShippingValues | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [carrier, setCarrier] = useState<CarrierId>("aramex")
  const [carrierName, setCarrierName] = useState("")
  const [number, setNumber] = useState("")
  const [url, setUrl] = useState("")
  const [urlTouched, setUrlTouched] = useState(false)

  useEffect(() => {
    if (!open) return
    setCarrier(current?.carrier ?? "aramex")
    setCarrierName(current?.carrierName ?? "")
    setNumber(current?.trackingNumber ?? "")
    setUrl(current?.trackingUrl ?? "")
    setUrlTouched(!!current?.trackingUrl)
  }, [open, current])

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: orpc.admin.orders.key() })
    queryClient.invalidateQueries({ queryKey: orpc.admin.overview.key() })
    onOpenChange(false)
    onDone()
  }
  const options = {
    onSuccess: refresh,
    onError: (error: unknown) => {
      onOpenChange(false)
      showError(errorMessage(error))
    },
  }
  const ship = useMutation(orpc.admin.orders.markShipped.mutationOptions(options))
  const update = useMutation(orpc.admin.orders.updateTracking.mutationOptions(options))
  const pending = ship.isPending || update.isPending

  const changeCarrier = (next: CarrierId) => {
    setCarrier(next)
    if (!urlTouched) setUrl(trackingUrlFor(next, number) ?? "")
  }
  const changeNumber = (next: string) => {
    setNumber(next)
    if (!urlTouched) setUrl(trackingUrlFor(carrier, next) ?? "")
  }

  const missingName = carrier === "other" && !carrierName.trim()
  const submit = () => {
    const payload = {
      id: order.id,
      carrier,
      carrierName: carrier === "other" ? carrierName.trim() : undefined,
      trackingNumber: number.trim() || undefined,
      trackingUrl: url.trim() || undefined,
    }
    if (editing) update.mutate(payload)
    else ship.mutate(payload)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifier le suivi" : "Marquer expédiée"}</DialogTitle>
          <DialogDescription>
            Commande {order.number}, {order.customerName}
            {editing ? null : ". Le client recevra un email avec le suivi."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="ship-carrier">Transporteur</Label>
            <SimpleSelect id="ship-carrier" value={carrier} onChange={changeCarrier} options={OPTIONS} />
          </div>
          {carrier === "other" && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="ship-carrier-name">Nom du transporteur</Label>
              <Input
                id="ship-carrier-name"
                className="h-11"
                maxLength={60}
                value={carrierName}
                onChange={(e) => setCarrierName(e.target.value)}
              />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor="ship-number">Numéro de suivi</Label>
            <Input
              id="ship-number"
              className="h-11 tabular-nums"
              maxLength={60}
              value={number}
              onChange={(e) => changeNumber(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ship-url">Lien de suivi</Label>
            <Input
              id="ship-url"
              className="h-11"
              type="url"
              inputMode="url"
              maxLength={500}
              placeholder="https://"
              value={url}
              onChange={(e) => {
                setUrlTouched(true)
                setUrl(e.target.value)
              }}
            />
            <p className="text-muted-foreground text-sm">Laissez vide si le transporteur n'a pas de suivi en ligne.</p>
          </div>
        </div>
        {!editing && order.paymentMethod === "cod" && order.status === "pending_payment" && (
          <p className="text-muted-foreground text-sm">
            Paiement à la livraison : la vente est comptée à l'expédition.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button className="h-11" disabled={pending || missingName} onClick={submit}>
            {editing ? "Enregistrer" : "Confirmer l'expédition"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
