"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { type InvoiceLocale, invoiceLocaleSchema } from "@workspace/sdk"
import { InvoiceDocument } from "@workspace/ui/brand/invoice-document"
import { Button } from "@workspace/ui/components/button"
import { use, useEffect, useState } from "react"
import { isUnauthorized } from "@/lib/errors"

const LANGUAGES: { id: InvoiceLocale; label: string }[] = [
  { id: "fr", label: "Français" },
  { id: "en", label: "English" },
  { id: "ar", label: "العربية" },
]

export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const queryClient = useQueryClient()
  const [lang, setLang] = useState<InvoiceLocale | undefined>()
  useEffect(() => {
    const asked = invoiceLocaleSchema.safeParse(new URLSearchParams(window.location.search).get("lang"))
    if (asked.success) setLang(asked.data)
  }, [])
  const input = { id, lang }
  const { data: view, isError, error } = useQuery(orpc.admin.invoices.get.queryOptions({ input }))
  const issue = useMutation({
    ...orpc.admin.invoices.issue.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.admin.invoices.get.key() }),
  })
  const expired = isError && isUnauthorized(error)
  useEffect(() => {
    if (expired) window.location.assign("/login")
  }, [expired])
  if (expired) return null
  if (isError) return <p className="p-8">Facture introuvable.</p>
  if (!view) return <p className="p-8 text-muted-foreground">Chargement…</p>

  const current = lang ?? view.orderLocale
  return (
    <main className="space-y-6 p-4 sm:p-8 print:p-0">
      <div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">Langue de la facture</span>
          {LANGUAGES.map((l) => (
            <Button
              key={l.id}
              size="sm"
              variant={current === l.id ? "default" : "outline"}
              onClick={() => setLang(l.id)}
            >
              {l.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          {view.canIssue && (
            <Button className="h-11" disabled={issue.isPending} onClick={() => issue.mutate({ id, lang })}>
              Émettre la facture
            </Button>
          )}
          <Button className="h-11" variant="outline" onClick={() => window.print()}>
            Imprimer ou enregistrer en PDF
          </Button>
        </div>
      </div>
      {issue.isError && (
        <p className="mx-auto max-w-[210mm] text-destructive text-sm">Impossible d’émettre la facture.</p>
      )}
      <div className="overflow-x-auto print:overflow-visible">
        <InvoiceDocument view={view} />
      </div>
    </main>
  )
}
