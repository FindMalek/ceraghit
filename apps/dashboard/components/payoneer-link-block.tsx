"use client"

import { CheckIcon, CopyIcon } from "@phosphor-icons/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { formatMoney, isPayoneerUrl } from "@workspace/sdk"
import { Button } from "@workspace/ui/components/button"
import { showError } from "@workspace/ui/components/error-banner"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { useState } from "react"
import { formatDate } from "@/lib/copy"
import { errorMessage } from "@/lib/errors"

interface PayoneerOrder {
  id: string
  number: string
  totalMinor: number
  currency: "TND" | "EUR"
  paymentLink: string | null
  paymentLinkSetAt: string | null
}

function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <span className="inline-flex items-center gap-1">
      <strong className="tabular-nums">{value}</strong>
      <Button
        type="button"
        variant="ghost"
        className="size-11"
        aria-label={copied ? `${label} copié` : `Copier ${label}`}
        onClick={() => {
          navigator.clipboard?.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </span>
  )
}

/** Pending Payoneer order: the owner makes the payment request in Payoneer, then pastes its link here. */
export function PayoneerLinkBlock({ order }: { order: PayoneerOrder }) {
  const queryClient = useQueryClient()
  const [link, setLink] = useState("")
  const [error, setError] = useState<string | null>(null)

  const save = useMutation(
    orpc.admin.orders.setPaymentLink.mutationOptions({
      onSuccess: () => {
        setLink("")
        queryClient.invalidateQueries({ queryKey: orpc.admin.orders.key() })
      },
      onError: (e) => showError(errorMessage(e)),
    }),
  )

  const submit = () => {
    const value = link.trim()
    if (!isPayoneerUrl(value)) {
      setError("Collez un lien https de payoneer.com.")
      return
    }
    setError(null)
    save.mutate({ id: order.id, link: value })
  }

  return (
    <section>
      <h2 className="mb-1 font-heading text-2xl">Lien de paiement Payoneer</h2>
      <p className="text-muted-foreground text-sm">
        Créez une demande de paiement dans Payoneer, puis collez le lien ici. Le client le reçoit par email.
        {order.paymentLink && " Remplacer le lien envoie un nouvel email au client."}
      </p>
      <dl className="mt-2">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">Montant</dt>
          <dd>
            <CopyValue label="le montant" value={formatMoney(order.totalMinor, order.currency, "fr")} />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">Référence</dt>
          <dd>
            <CopyValue label="la référence" value={order.number} />
          </dd>
        </div>
      </dl>
      {order.paymentLink && (
        <p className="mt-2 break-all text-sm">
          Lien actuel : {order.paymentLink}
          {order.paymentLinkSetAt && (
            <span className="block text-muted-foreground">Envoyé le {formatDate(order.paymentLinkSetAt)}</span>
          )}
        </p>
      )}
      <div className="mt-2 flex flex-col gap-1">
        <Label htmlFor="payoneer-link">Lien Payoneer</Label>
        <Input
          id="payoneer-link"
          className="h-11"
          inputMode="url"
          maxLength={500}
          placeholder="https://link.payoneer.com/..."
          value={link}
          aria-invalid={error !== null}
          onChange={(e) => setLink(e.target.value)}
        />
        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>
      <Button className="mt-2 h-11" disabled={save.isPending || link.trim() === ""} onClick={submit}>
        {order.paymentLink ? "Remplacer le lien" : "Envoyer au client"}
      </Button>
    </section>
  )
}
