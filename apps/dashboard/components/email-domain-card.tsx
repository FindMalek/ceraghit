"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import type { EmailDomain } from "@workspace/sdk"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { showError } from "@workspace/ui/components/error-banner"
import { Spinner } from "@workspace/ui/components/spinner"
import Link from "next/link"
import { useState } from "react"
import { errorMessage } from "@/lib/errors"

type Row = { key: string; label: string; type: string; name: string; value: string; status: string; hint?: string }

const STATE: Record<EmailDomain["state"], { label: string; variant: "default" | "secondary" | "destructive" }> = {
  verified: { label: "Vérifié", variant: "default" },
  pending: { label: "En attente", variant: "secondary" },
  failed: { label: "Échec", variant: "destructive" },
  not_found: { label: "Domaine absent de Resend", variant: "destructive" },
  restricted_key: { label: "Clé Resend limitée à l'envoi", variant: "destructive" },
  not_configured: { label: "Non configuré (aperçu)", variant: "secondary" },
}

const EXPLAIN: Partial<Record<EmailDomain["state"], string>> = {
  not_found: "Ce domaine n'existe pas dans votre compte Resend. Ajoutez-le sur resend.com, puis revenez ici.",
  restricted_key:
    "La clé Resend ne peut qu'envoyer des emails. Créez une clé avec accès complet pour voir l'état du domaine ici.",
  not_configured: "Les aperçus envoient leurs emails dans Mailpit : il n'y a pas de domaine à vérifier.",
  failed: "Resend n'a pas pu vérifier le domaine. Contrôlez les enregistrements ci-dessous.",
}

const RECORD_STATE: Record<string, string> = {
  verified: "Vérifié",
  pending: "En attente",
  not_started: "À ajouter",
  failed: "Échec",
  temporary_failure: "Échec temporaire",
}

function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 min-w-24"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        } catch {
          showError("Copie impossible, sélectionnez la valeur à la main.")
        }
      }}
    >
      {done ? "Copié" : "Copier"}
    </Button>
  )
}

function RecordCard({ row }: { row: Row }) {
  return (
    <li className="frame flex flex-col gap-2 bg-card/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-heading">
          {row.label} <span className="text-muted-foreground text-sm">{row.type}</span>
          {row.hint && <Badge variant="outline">{row.hint}</Badge>}
        </p>
        <span className="text-muted-foreground text-sm">{RECORD_STATE[row.status] ?? row.status}</span>
      </div>
      <dl className="grid gap-1 text-sm md:grid-cols-[4rem_1fr] md:gap-x-3">
        <dt className="text-muted-foreground">Nom</dt>
        <dd>
          <bdi className="select-all break-all font-mono">{row.name}</bdi>
        </dd>
        <dt className="text-muted-foreground">Valeur</dt>
        <dd>
          <bdi className="select-all break-all font-mono">{row.value}</bdi>
        </dd>
      </dl>
      <div>
        <CopyButton value={row.value} />
      </div>
    </li>
  )
}

/** Sending-domain state, the DNS records to add and a test email. Used in the settings and in the onboarding step. */
export function EmailDomainCard() {
  const queryClient = useQueryClient()
  const query = useQuery(orpc.admin.mail.domain.queryOptions({ input: {}, staleTime: 60_000 }))
  const [sent, setSent] = useState<{ ok: boolean; to: string } | null>(null)
  const verify = useMutation(
    orpc.admin.mail.verifyDomain.mutationOptions({
      onSuccess: (data) => queryClient.setQueryData(orpc.admin.mail.domain.queryKey({ input: {} }), data),
      onError: (error) => showError(errorMessage(error)),
    }),
  )
  const test = useMutation(
    orpc.admin.mail.test.mutationOptions({
      onSuccess: setSent,
      onError: (error) => {
        setSent(null)
        showError(errorMessage(error))
      },
    }),
  )
  const data = query.data
  if (query.isError) return <p className="text-destructive text-sm">{errorMessage(query.error)}</p>
  if (!data) return <div className="frame h-40 animate-pulse bg-card/60" aria-hidden />

  const rows: Row[] = data.records.map((r, i) => ({
    key: `${r.type}-${r.name}-${i}`,
    label: r.purpose,
    type: r.type,
    name: r.name,
    value: r.priority === null ? r.value : `${r.priority} ${r.value}`,
    status: r.status,
  }))
  if (data.dmarc && data.state !== "not_configured")
    rows.push({
      key: "dmarc",
      label: "DMARC",
      type: "TXT",
      name: data.dmarc.name,
      value: data.dmarc.value,
      status: "",
      hint: "recommandé",
    })

  return (
    <section className="frame flex flex-col gap-4 bg-card/60 p-4" aria-labelledby="email-domain-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="email-domain-title" className="font-heading text-lg">
          Emails
        </h2>
        <Badge variant={STATE[data.state].variant}>{STATE[data.state].label}</Badge>
      </div>
      <p className="text-sm">
        Les emails partent de <bdi className="font-mono">{data.from || "—"}</bdi>.
      </p>
      {EXPLAIN[data.state] && <p className="text-muted-foreground text-sm">{EXPLAIN[data.state]}</p>}
      {rows.length > 0 && (
        <>
          <p className="text-muted-foreground text-sm">
            Ajoutez ces enregistrements chez l'hébergeur DNS de {data.domain}, puis cliquez sur Vérifier. La propagation
            peut prendre jusqu'à 48 h.
          </p>
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <RecordCard key={row.key} row={row} />
            ))}
          </ul>
        </>
      )}
      <div className="flex flex-col gap-2 md:flex-row">
        {data.state !== "not_configured" && (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={verify.isPending}
            onClick={() => verify.mutate({})}
          >
            {verify.isPending && <Spinner />}
            Vérifier maintenant
          </Button>
        )}
        <Button type="button" className="h-11" disabled={test.isPending} onClick={() => test.mutate({})}>
          {test.isPending && <Spinner />}
          Envoyer un email de test
        </Button>
      </div>
      {sent && (
        <p className="text-sm" role="status">
          {sent.ok ? (
            <>Email envoyé à {sent.to}.</>
          ) : (
            <>
              L'email n'a pas pu partir à {sent.to}.{" "}
              <Link href="/emails" className="underline underline-offset-4">
                Emails en échec
              </Link>
            </>
          )}
        </p>
      )}
    </section>
  )
}
