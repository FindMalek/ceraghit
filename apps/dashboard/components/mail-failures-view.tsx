"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import type { MailLogItem } from "@workspace/sdk"
import { Button } from "@workspace/ui/components/button"
import { showError } from "@workspace/ui/components/error-banner"
import { Spinner } from "@workspace/ui/components/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import Link from "next/link"
import { useState } from "react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { PageBody, PageHeader } from "@/components/page-header"
import { EmptyState, ErrorState, LoadingRows } from "@/components/query-state"
import { formatDate, MAIL_KIND } from "@/lib/copy"
import { errorMessage } from "@/lib/errors"

function OrderLink({ number }: { number: string | null }) {
  if (!number) return <span className="text-muted-foreground">—</span>
  return (
    <Link href={`/orders?q=${encodeURIComponent(number)}`} className="underline underline-offset-4">
      {number}
    </Link>
  )
}

export function MailFailuresView() {
  const queryClient = useQueryClient()
  const failures = useQuery(orpc.admin.mail.failures.queryOptions({ input: {} }))
  const [dismissing, setDismissing] = useState<MailLogItem | null>(null)
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: orpc.admin.mail.key() })
    queryClient.invalidateQueries({ queryKey: orpc.admin.overview.key() })
  }
  const resend = useMutation(
    orpc.admin.mail.resend.mutationOptions({
      onSuccess: (result) => {
        if (!result.ok) showError("L'email n'a pas pu être envoyé. Réessayez plus tard.")
        refresh()
      },
      onError: (error) => showError(errorMessage(error)),
    }),
  )
  const dismiss = useMutation(
    orpc.admin.mail.dismiss.mutationOptions({ onSuccess: refresh, onError: (error) => showError(errorMessage(error)) }),
  )
  const items = failures.data?.items ?? []
  const busy = (id: string) => resend.isPending && resend.variables?.id === id

  const actions = (item: MailLogItem) => (
    <div className="flex gap-2">
      <Button
        type="button"
        className="h-11 min-w-28 flex-1 md:flex-none"
        disabled={busy(item.id)}
        onClick={() => resend.mutate({ id: item.id })}
      >
        {busy(item.id) && <Spinner />}
        Renvoyer
      </Button>
      <Button type="button" variant="outline" className="h-11 flex-1 md:flex-none" onClick={() => setDismissing(item)}>
        Ignorer
      </Button>
    </div>
  )

  return (
    <>
      <PageHeader
        title="Emails en échec"
        description="Les emails qui n'ont pas pu partir. Renvoyez-les, ou ignorez-les si vous avez écrit au client vous-même."
      />
      <PageBody>
        {failures.isPending && <LoadingRows rows={3} />}
        {failures.isError && <ErrorState error={failures.error} onRetry={() => failures.refetch()} />}
        {failures.data && items.length === 0 && <EmptyState title="Aucun email en échec." />}
        {items.length > 0 && (
          <>
            <div className="frame hidden bg-card/70 md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Destinataire</TableHead>
                    <TableHead>Sujet</TableHead>
                    <TableHead>Erreur</TableHead>
                    <TableHead className="text-right">Essais</TableHead>
                    <TableHead>Commande</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(item.createdAt)}</TableCell>
                      <TableCell>{MAIL_KIND[item.kind] ?? item.kind}</TableCell>
                      <TableCell className="break-all">{item.to}</TableCell>
                      <TableCell className="max-w-56 whitespace-normal">{item.subject}</TableCell>
                      <TableCell className="max-w-56 whitespace-normal text-destructive">{item.error}</TableCell>
                      <TableCell className="text-right tabular-nums">{item.attempts}</TableCell>
                      <TableCell>
                        <OrderLink number={item.orderNumber} />
                      </TableCell>
                      <TableCell>{actions(item)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="flex flex-col gap-3 md:hidden">
              {items.map((item) => (
                <li key={item.id} className="frame flex flex-col gap-2 bg-card/70 p-3">
                  <span className="text-xl">{MAIL_KIND[item.kind] ?? item.kind}</span>
                  <span className="text-muted-foreground text-sm">
                    {formatDate(item.createdAt)} · {item.attempts} essai{item.attempts > 1 ? "s" : ""}
                  </span>
                  <span className="break-all">{item.to}</span>
                  <span className="text-muted-foreground">{item.subject}</span>
                  <span className="break-words text-destructive text-sm">{item.error}</span>
                  <span className="text-sm">
                    Commande : <OrderLink number={item.orderNumber} />
                  </span>
                  {actions(item)}
                </li>
              ))}
            </ul>
          </>
        )}
      </PageBody>
      <ConfirmDialog
        open={dismissing !== null}
        onOpenChange={(open) => !open && setDismissing(null)}
        title="Ignorer cet email ?"
        description="L'email ne sera pas renvoyé."
        confirmLabel="Ignorer"
        destructive
        onConfirm={() => dismissing && dismiss.mutate({ id: dismissing.id })}
      />
    </>
  )
}
