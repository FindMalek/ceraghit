"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { Button } from "@workspace/ui/components/button"
import { FieldDescription, FieldError } from "@workspace/ui/components/field"
import { Spinner } from "@workspace/ui/components/spinner"
import { formatDate } from "@/lib/copy"
import { errorMessage } from "@/lib/errors"

/** The Tunisian city list the checkout picks from, fetched from Aramex and cached a week. */
export function AramexCities() {
  const settings = useQuery(orpc.admin.shipping.getSettings.queryOptions({ input: {} }))
  const refresh = useMutation(orpc.admin.shipping.refreshCities.mutationOptions())
  if (settings.data?.mode.provider !== "aramex" || settings.data.degraded) return null
  const done = refresh.data

  return (
    <section className="flex flex-col gap-3" aria-label="Villes">
      <div>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          disabled={refresh.isPending}
          onClick={() => refresh.mutate({ country: "TN" })}
        >
          {refresh.isPending && <Spinner />}
          Mettre à jour la liste des villes
        </Button>
      </div>
      <FieldDescription>
        Les clients choisissent leur ville dans la liste d'Aramex pour la Tunisie. Elle se met à jour toute seule chaque
        semaine.
      </FieldDescription>
      {done && done.count > 0 && (
        <p role="status" data-testid="cities-count" className="text-primary text-sm">
          {done.count} villes{done.fetchedAt ? `, mise à jour le ${formatDate(done.fetchedAt)}` : ""}.
        </p>
      )}
      {done && done.count === 0 && <FieldError>Aramex n'a pas répondu, la liste précédente est conservée.</FieldError>}
      {refresh.isError && <FieldError>{errorMessage(refresh.error)}</FieldError>}
    </section>
  )
}
