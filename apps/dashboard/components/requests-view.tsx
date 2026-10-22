"use client"

import { CopyIcon, EnvelopeSimpleIcon } from "@phosphor-icons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { errorMessage } from "@workspace/orpc/errors"
import { orpc } from "@workspace/orpc/react"
import { imageSrc } from "@workspace/sdk"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { Spinner } from "@workspace/ui/components/spinner"
import { Textarea } from "@workspace/ui/components/textarea"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { PageBody, PageHeader } from "@/components/page-header"
import { EmptyState, ErrorState, LoadingRows } from "@/components/query-state"
import { SimpleSelect } from "@/components/simple-select"
import { RequestStatusBadge } from "@/components/status-badge"
import { formatDate, REQUEST_STATUS } from "@/lib/copy"

type Status = "new" | "contacted" | "done" | "declined"
type Filter = "all" | Status

const FILTERS = [
  { value: "all" as const, label: "Toutes les demandes" },
  ...Object.entries(REQUEST_STATUS).map(([value, label]) => ({ value: value as Status, label })),
]
const STATUS_OPTIONS = Object.entries(REQUEST_STATUS).map(([value, label]) => ({ value: value as Status, label }))

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="whitespace-pre-wrap break-words">{value || "—"}</dd>
    </div>
  )
}

type Request = NonNullable<ReturnType<typeof useRequests>["data"]>[number]

function useRequests(status: Filter) {
  return useQuery(orpc.admin.requests.list.queryOptions({ input: { status: status === "all" ? undefined : status } }))
}

function RequestSheet({ request, onClose }: { request: Request | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<Status>("new")
  const [note, setNote] = useState("")

  useEffect(() => {
    if (!request) return
    setStatus(request.status)
    setNote(request.adminNote ?? "")
  }, [request])

  const save = useMutation(
    orpc.admin.requests.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.admin.requests.key() })
        queryClient.invalidateQueries({ queryKey: orpc.admin.overview.key() })
        toast.success("Demande enregistrée.")
        onClose()
      },
      onError: (error) => toast.error(errorMessage(error)),
    }),
  )

  const copyEmail = async () => {
    if (!request) return
    try {
      await navigator.clipboard.writeText(request.email)
      toast.success("Email copié.")
    } catch {
      toast.error("Copie impossible, sélectionnez l'adresse à la main.")
    }
  }

  return (
    <Sheet open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {request && (
          <>
            <SheetHeader>
              <SheetTitle className="text-3xl">{request.name}</SheetTitle>
              <SheetDescription>Reçue le {formatDate(request.createdAt)}</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-4 px-4 pb-4">
              <div className="flex flex-wrap gap-2">
                <a
                  className={buttonVariants({ size: "lg" })}
                  href={`mailto:${request.email}?subject=${encodeURIComponent("Votre demande de pièce unique, Ceraghit")}`}
                >
                  <EnvelopeSimpleIcon /> Répondre par email
                </a>
                <Button type="button" variant="outline" size="lg" onClick={copyEmail}>
                  <CopyIcon /> Copier l'email
                </Button>
              </div>
              <dl className="divide-y">
                <Row label="Email" value={<span className="break-all">{request.email}</span>} />
                <Row label="Téléphone" value={request.phone} />
                <Row label="Pays" value={request.country} />
                <Row label="Description" value={request.description} />
                <Row label="Dimensions" value={request.dimensions} />
                <Row label="Budget" value={request.budget} />
                <Row label="Références" value={request.references} />
              </dl>
              {request.images.length > 0 && (
                <div className="space-y-2">
                  <p className="font-heading text-muted-foreground text-sm">Photos jointes</p>
                  <ul className="grid grid-cols-3 gap-3">
                    {request.images.map((image) => (
                      <li key={image}>
                        <a
                          href={imageSrc(image)}
                          target="_blank"
                          rel="noreferrer"
                          className="frame block aspect-square overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {/* biome-ignore lint/performance/noImgElement: customer photos from the bucket, any size */}
                          <img
                            src={imageSrc(image)}
                            alt="Référence jointe par le client"
                            className="size-full object-cover"
                          />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Field>
                <FieldLabel htmlFor="request-status">Statut</FieldLabel>
                <SimpleSelect id="request-status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
              </Field>
              <Field>
                <FieldLabel htmlFor="request-note">Note privée</FieldLabel>
                <Textarea
                  id="request-note"
                  rows={4}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Visible par vous seulement."
                />
              </Field>
            </div>
            <SheetFooter className="sticky bottom-0 flex-row justify-end border-t bg-background/95 backdrop-blur">
              <Button type="button" variant="ghost" className="h-11" onClick={onClose}>
                Fermer
              </Button>
              <Button
                type="button"
                className="h-11 min-w-36"
                disabled={save.isPending}
                onClick={() => save.mutate({ id: request.id, status, adminNote: note.trim() || null })}
              >
                {save.isPending && <Spinner />}
                Enregistrer
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

export function RequestsView() {
  const [status, setStatus] = useState<Filter>("all")
  const [selected, setSelected] = useState<string | null>(null)
  const requests = useRequests(status)
  const rows = requests.data ?? []
  const current = rows.find((request) => request.id === selected) ?? null

  return (
    <>
      <PageHeader
        title="Demandes"
        description="Les demandes de pièces uniques. Vous répondez depuis votre boîte mail."
      />
      <PageBody>
        <SimpleSelect value={status} onChange={setStatus} options={FILTERS} className="h-11 w-full md:w-64" />
        {requests.isPending && <LoadingRows rows={4} />}
        {requests.isError && <ErrorState error={requests.error} onRetry={() => requests.refetch()} />}
        {requests.data && rows.length === 0 && (
          <EmptyState
            title="Aucune demande"
            description="Les demandes envoyées depuis « Créer une pièce unique » arrivent ici."
          />
        )}
        <ul className="flex flex-col gap-3">
          {rows.map((request) => (
            <li key={request.id}>
              <button
                type="button"
                onClick={() => setSelected(request.id)}
                className="frame flex w-full flex-col gap-1 bg-card/70 p-3 text-left"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-xl">{request.name}</span>
                  <RequestStatusBadge status={request.status} />
                </span>
                <span className="line-clamp-2 text-muted-foreground">{request.description}</span>
                <span className="text-muted-foreground text-sm">
                  {request.email} · {formatDate(request.createdAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PageBody>
      <RequestSheet request={current} onClose={() => setSelected(null)} />
    </>
  )
}
