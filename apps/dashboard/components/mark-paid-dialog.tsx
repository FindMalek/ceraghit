"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { formatMoney, type ManualPaymentMethod } from "@workspace/sdk"
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
import { Textarea } from "@workspace/ui/components/textarea"
import { useEffect, useState } from "react"
import { SimpleSelect } from "@/components/simple-select"
import { errorMessage } from "@/lib/errors"

export const MANUAL_METHOD_LABEL: Record<ManualPaymentMethod, string> = {
  transfer: "Virement bancaire",
  payoneer: "Payoneer",
  cash: "Espèces",
  other: "Autre",
}

const OPTIONS = (Object.keys(MANUAL_METHOD_LABEL) as ManualPaymentMethod[]).map((value) => ({
  value,
  label: MANUAL_METHOD_LABEL[value],
}))

interface PayableOrder {
  id: string
  number: string
  customerName: string
  totalMinor: number
  currency: "TND" | "EUR"
  paymentMethod: "online" | "cod" | "transfer"
}

export function MarkPaidDialog({
  order,
  open,
  onOpenChange,
  onDone,
}: {
  order: PayableOrder
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [method, setMethod] = useState<ManualPaymentMethod>("transfer")
  const [reference, setReference] = useState("")
  const [note, setNote] = useState("")

  useEffect(() => {
    if (!open) return
    setMethod(order.paymentMethod === "transfer" ? "transfer" : "other")
    setReference("")
    setNote("")
  }, [open, order.paymentMethod])

  const mutation = useMutation(
    orpc.admin.orders.markPaidManually.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.admin.orders.key() })
        queryClient.invalidateQueries({ queryKey: orpc.admin.overview.key() })
        onOpenChange(false)
        onDone()
      },
      onError: (error) => showError(errorMessage(error)),
    }),
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmer le paiement reçu</DialogTitle>
          <DialogDescription>
            Commande {order.number}, {order.customerName}
          </DialogDescription>
        </DialogHeader>
        <p className="font-heading text-3xl tabular-nums">{formatMoney(order.totalMinor, order.currency, "fr")}</p>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="paid-method">Reçu par</Label>
            <SimpleSelect id="paid-method" value={method} onChange={setMethod} options={OPTIONS} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="paid-reference">Référence du paiement (facultatif)</Label>
            <Input
              id="paid-reference"
              className="h-11"
              maxLength={120}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="paid-note">Note (facultatif)</Label>
            <Textarea id="paid-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          Vérifiez que ce montant est bien arrivé sur votre compte avant de confirmer. Le client reçoit un email de
          confirmation.
        </p>
        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            className="h-11"
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate({
                id: order.id,
                method,
                reference: reference.trim() || null,
                note: note.trim() || null,
                totalMinor: order.totalMinor,
                currency: order.currency,
              })
            }
          >
            Confirmer le paiement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
