"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import { errorMessage } from "@/lib/errors"

/** Asks Aramex whether the delivery address is one it recognises, before a label is made for it. Aramex mode only. */
export function AddressCheck({
  orderId,
  address,
  onUse,
}: {
  orderId: string
  /** The address to check when it is not the order's (the shipment dialog's edited one). */
  address?: { line1: string; city: string; postalCode?: string }
  /** Offers a button on each suggestion that applies it. */
  onUse?: (suggestion: { line1: string; city: string; postalCode: string }) => void
}) {
  const settings = useQuery(orpc.admin.shipping.getSettings.queryOptions({ input: {} }))
  const check = useMutation(orpc.admin.shipping.checkAddress.mutationOptions())
  if (settings.data?.mode.provider !== "aramex" || settings.data.degraded) return null
  const result = check.data

  return (
    <div className="mt-2 flex flex-col gap-2">
      <Button
        variant="outline"
        className="h-11 self-start"
        disabled={check.isPending}
        onClick={() => check.mutate({ orderId, ...(address ? { address } : {}) })}
      >
        {check.isPending && <Spinner />}
        Vérifier l'adresse avec Aramex
      </Button>
      {check.isError && (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(check.error)}
        </p>
      )}
      {result && (
        <div role="status" data-testid="address-check" className="text-sm">
          <p className={result.ok ? "text-jade" : "text-ochre"}>{result.message}</p>
          {result.suggestions.map((s) => (
            <div
              key={`${s.line1}|${s.city}|${s.postalCode}`}
              className="flex flex-wrap items-center gap-2 text-muted-foreground"
            >
              <span>
                {s.line1}, {s.postalCode} {s.city}
              </span>
              {onUse && (
                <Button
                  variant="outline"
                  className="h-11"
                  onClick={() => {
                    onUse(s)
                    check.reset()
                  }}
                >
                  Utiliser cette suggestion
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
