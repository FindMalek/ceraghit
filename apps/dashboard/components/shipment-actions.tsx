"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import type { AdminShipment } from "@workspace/sdk"
import { Button } from "@workspace/ui/components/button"
import { showError } from "@workspace/ui/components/error-banner"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { useState } from "react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { errorMessage } from "@/lib/errors"

const REASON = "Annulée par le propriétaire"
const dayOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" }).format(d)

/** The next day that is not a Sunday, as YYYY-MM-DD in Africa/Tunis. */
function nextWorkingDay(): string {
  const d = new Date(`${dayOf(new Date())}T12:00:00Z`)
  do d.setUTCDate(d.getUTCDate() + 1)
  while (d.getUTCDay() === 0)
  return d.toISOString().slice(0, 10)
}

/** Pickup booking and cancellation for a parcel whose label was just created. Aramex has no real cancel: it is a hold. */
export function ShipmentActions({ shipment: s }: { shipment: AdminShipment }) {
  const queryClient = useQueryClient()
  const [confirm, setConfirm] = useState(false)
  const [booking, setBooking] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [date, setDate] = useState(nextWorkingDay)
  const [ready, setReady] = useState("09:00")
  const [closing, setClosing] = useState("17:00")
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.admin.shipping.shipmentOf.key() })
  const onError = (error: unknown) => showError(errorMessage(error))

  const book = useMutation(
    orpc.admin.shipping.createPickup.mutationOptions({
      onSuccess: ({ pickupId }) => {
        setBooking(false)
        setDone(`Enlèvement demandé (n° ${pickupId}).`)
        refresh()
      },
      onError,
    }),
  )
  const unbook = useMutation(
    orpc.admin.shipping.cancelPickup.mutationOptions({
      onSuccess: () => {
        setDone("Enlèvement annulé.")
        refresh()
      },
      onError,
    }),
  )
  const cancel = useMutation(
    orpc.admin.shipping.cancelShipment.mutationOptions({
      onSuccess: ({ message }) => {
        setDone(message)
        queryClient.invalidateQueries()
      },
      onError,
    }),
  )

  if (s.status === "cancelled") {
    const hold = s.errors.find((e) => e.code === "HOLD")
    return hold ? (
      <p role="alert" data-testid="hold-warning" className="text-destructive text-sm">
        {hold.message}
      </p>
    ) : done ? (
      <p role="status">{done}</p>
    ) : null
  }
  if (s.status !== "created" || s.provider !== "aramex") return null
  return (
    <div className="flex flex-col gap-2" data-testid="shipment-actions">
      {s.pickupId ? (
        <div className="flex flex-wrap items-center gap-2">
          <p data-testid="pickup-booked">Enlèvement demandé (n° {s.pickupId})</p>
          <Button
            variant="outline"
            className="h-11"
            disabled={unbook.isPending}
            onClick={() => unbook.mutate({ pickupId: s.pickupId as string, reason: "Annulé par le propriétaire" })}
          >
            Annuler l'enlèvement
          </Button>
        </div>
      ) : booking ? (
        <div className="flex flex-wrap items-end gap-2">
          <Label className="flex flex-col gap-1">
            Date d'enlèvement
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Label>
          <Label className="flex flex-col gap-1">
            Prêt à partir de
            <Input type="time" value={ready} onChange={(e) => setReady(e.target.value)} />
          </Label>
          <Label className="flex flex-col gap-1">
            Fermeture de l'atelier
            <Input type="time" value={closing} onChange={(e) => setClosing(e.target.value)} />
          </Label>
          <Button
            className="h-11"
            disabled={book.isPending}
            onClick={() => book.mutate({ shipmentIds: [s.id], date, readyTime: ready, closingTime: closing })}
          >
            Demander l'enlèvement
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-11" onClick={() => setBooking(true)}>
            Demander un enlèvement Aramex
          </Button>
          <Button variant="outline" className="h-11 text-destructive" onClick={() => setConfirm(true)}>
            Annuler l'expédition
          </Button>
        </div>
      )}
      {done && (
        <p role="status" data-testid="shipment-action-done">
          {done}
        </p>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Annuler l'expédition ?"
        description="L'expédition sera mise en attente chez Aramex et la commande repassera « payée » (ou « à payer à la livraison »). L'e-mail d'expédition déjà envoyé au client ne peut pas être annulé. La mise en attente peut échouer : si le colis est déjà parti, Aramex peut encore le récupérer, appelez votre agence."
        confirmLabel="Annuler l'expédition"
        destructive
        onConfirm={() => cancel.mutate({ id: s.id, reason: REASON })}
      />
    </div>
  )
}
