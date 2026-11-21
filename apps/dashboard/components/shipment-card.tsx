"use client"

import { CheckIcon, CopyIcon } from "@phosphor-icons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { formatMoney, SHIPMENT_STATUS_LABELS } from "@workspace/sdk"
import { Button } from "@workspace/ui/components/button"
import { showError } from "@workspace/ui/components/error-banner"
import { useState } from "react"
import { EnvironmentChip } from "@/components/create-shipment-dialog"
import { ShipmentActions } from "@/components/shipment-actions"
import { Tone } from "@/components/status-badge"
import { errorMessage } from "@/lib/errors"

const TONES = { delivered: "good", exception: "bad", returned: "bad", cancelled: "quiet", on_hold: "warn" } as const

/** The Aramex shipment of an order: waybill, status and the private label, read through a short signed link. */
export function ShipmentCard({ orderId }: { orderId: string }) {
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)
  const shipment = useQuery(orpc.admin.shipping.shipmentOf.queryOptions({ input: { orderId } }))
  const open = useMutation(
    orpc.admin.shipping.labelUrl.mutationOptions({
      onSuccess: ({ url }) => window.open(url, "_blank", "noopener,noreferrer"),
      onError: (error) => showError(errorMessage(error)),
    }),
  )
  const retry = useMutation(
    orpc.admin.shipping.retryLabel.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.admin.shipping.shipmentOf.key() }),
      onError: (error) => showError(errorMessage(error)),
    }),
  )
  const invoice = useMutation(
    orpc.admin.shipping.commercialInvoiceUrl.mutationOptions({
      onSuccess: ({ url }) => window.open(url, "_blank", "noopener,noreferrer"),
      onError: (error) => showError(errorMessage(error)),
    }),
  )
  const retryInvoice = useMutation(
    orpc.admin.shipping.retryCommercialInvoice.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.admin.shipping.shipmentOf.key() }),
      onError: (error) => showError(errorMessage(error)),
    }),
  )
  const s = shipment.data
  if (!s) return null
  const invoiceError = s.errors.find((e) => e.code === "INVOICE")
  const labelError = s.errors.find((e) => e.code === "LABEL")

  return (
    <section aria-label="Expédition Aramex" data-testid="shipment-card" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-2xl">Expédition Aramex</h2>
        <EnvironmentChip environment={s.environment} />
      </div>
      <dl className="flex flex-col gap-1 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <dt className="text-muted-foreground">Lettre de transport</dt>
          <dd className="inline-flex items-center gap-1">
            <span className="break-all tabular-nums" data-testid="shipment-waybill">
              {s.waybill}
            </span>
            <Button
              variant="ghost"
              className="size-11"
              aria-label={copied ? "Numéro copié" : "Copier la lettre de transport"}
              onClick={() => {
                navigator.clipboard?.writeText(s.waybill)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </Button>
          </dd>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <dt className="text-muted-foreground">Statut</dt>
          <dd>
            <Tone tone={TONES[s.status as keyof typeof TONES] ?? "info"}>{SHIPMENT_STATUS_LABELS[s.status]}</Tone>
          </dd>
        </div>
        {s.codAmountMinor !== null && (
          <div className="flex flex-wrap gap-2">
            <dt className="text-muted-foreground">À encaisser</dt>
            <dd className="tabular-nums">{formatMoney(s.codAmountMinor, s.currency)}</dd>
          </div>
        )}
      </dl>
      <ShipmentActions shipment={s} />
      {s.hasLabel ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="h-11"
            disabled={open.isPending}
            onClick={() => open.mutate({ id: s.id })}
          >
            Télécharger l'étiquette (PDF)
          </Button>
          <Button
            variant="outline"
            className="h-11"
            disabled={open.isPending}
            onClick={() => open.mutate({ id: s.id, inline: true })}
          >
            Imprimer
          </Button>
        </div>
      ) : labelError ? (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-destructive text-sm">
            {labelError.message}
          </p>
          <Button className="h-11 self-start" disabled={retry.isPending} onClick={() => retry.mutate({ id: s.id })}>
            Réessayer l'étiquette
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Étiquette indisponible (données de démonstration).</p>
      )}
      {s.hasCommercialInvoice && (
        <Button
          variant="outline"
          className="h-11 self-start"
          disabled={invoice.isPending}
          onClick={() => invoice.mutate({ id: s.id })}
        >
          Facture commerciale (PDF)
        </Button>
      )}
      {invoiceError && !s.hasCommercialInvoice && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-destructive text-sm">
            {invoiceError.message}
          </p>
          <Button
            className="h-11 self-start"
            disabled={retryInvoice.isPending}
            onClick={() => retryInvoice.mutate({ id: s.id })}
          >
            Réessayer la facture commerciale
          </Button>
        </div>
      )}
    </section>
  )
}
