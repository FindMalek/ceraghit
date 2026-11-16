"use client"

import { ORPCError } from "@orpc/client"
import { XIcon } from "@phosphor-icons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { browserClient, orpc } from "@workspace/orpc/react"
import { imageSrc } from "@workspace/sdk"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@workspace/ui/components/drawer"
import { showError } from "@workspace/ui/components/error-banner"
import { Field, FieldDescription, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@workspace/ui/components/sheet"
import { Spinner } from "@workspace/ui/components/spinner"
import { Switch } from "@workspace/ui/components/switch"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import Link from "next/link"
import { useEffect, useState } from "react"
import { useAppConfig } from "@/components/app-config"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { LocalizedField } from "@/components/localized-field"
import { ErrorState } from "@/components/query-state"
import { errorMessage } from "@/lib/errors"
import { fromLocalizedDraft, type LocalizedDraft, toLocalizedDraft } from "@/lib/localized"
import { addTag, formatBytes, formatDay } from "@/lib/media-query"

const IN_USE = "Cette photo est encore utilisée. Retirez-la d'abord des pages qui l'affichent."

function DetailBody({ id, onClose }: { id: string; onClose: () => void }) {
  const { webUrl } = useAppConfig()
  const queryClient = useQueryClient()
  const detail = useQuery(orpc.admin.media.get.queryOptions({ input: { id } }))
  const media = detail.data
  const [filename, setFilename] = useState("")
  const [alt, setAlt] = useState<LocalizedDraft>(toLocalizedDraft(null))
  const [tags, setTags] = useState<string[]>([])
  const [tagText, setTagText] = useState("")
  const [keep, setKeep] = useState(false)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!media) return
    setFilename(media.filename)
    setAlt(toLocalizedDraft(media.alt))
    setTags(media.tags)
    setKeep(media.keep)
  }, [media])

  const refresh = () =>
    Promise.all(
      [orpc.admin.media.list, orpc.admin.media.tags, orpc.admin.media.get, orpc.admin.uploads.usage].map((p) =>
        queryClient.invalidateQueries({ queryKey: p.key() }),
      ),
    )
  const save = useMutation({
    mutationFn: () =>
      browserClient.admin.media.update({ id, filename, alt: fromLocalizedDraft(alt, true), tags, keep }),
    onSuccess: refresh,
    onError: (error) => showError(errorMessage(error)),
  })
  const remove = useMutation({
    mutationFn: () => browserClient.admin.media.remove({ id }),
    onSuccess: async () => {
      await refresh()
      onClose()
    },
    onError: (error) =>
      showError(error instanceof ORPCError && error.code === "CONFLICT" ? IN_USE : errorMessage(error)),
  })

  if (detail.isError) return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
  if (!media) return <Spinner className="m-6" />
  const bundled = media.source === "bundled"
  const addTags = (raw: string) => {
    setTags((current) => raw.split(",").reduce(addTag, current))
    setTagText("")
  }
  return (
    <div className="flex flex-col gap-5 overflow-y-auto px-4 pb-6">
      {/* biome-ignore lint/performance/noImgElement: preview of a library image */}
      <img
        src={imageSrc(media.src, webUrl)}
        alt={media.alt?.fr ?? ""}
        className="max-h-72 w-full border object-contain"
      />
      <Field>
        <FieldLabel htmlFor="media-filename">Nom du fichier</FieldLabel>
        <Input id="media-filename" className="h-11" value={filename} onChange={(e) => setFilename(e.target.value)} />
        <FieldDescription>
          Le nom sert à retrouver la photo. Il ne change pas les pages qui l'affichent.
        </FieldDescription>
      </Field>
      <LocalizedField
        id="media-alt"
        label="Texte alternatif"
        value={alt}
        onChange={setAlt}
        hint="Décrit la photo pour les personnes malvoyantes et Google."
      />
      <Field>
        <FieldLabel htmlFor="media-tags">Mots-clés</FieldLabel>
        {tags.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <li key={tag}>
                <Badge variant="secondary" className="h-8 gap-1">
                  {tag}
                  <button
                    type="button"
                    aria-label={`Retirer le mot-clé ${tag}`}
                    className="grid min-h-6 min-w-6 place-items-center"
                    onClick={() => setTags(tags.filter((t) => t !== tag))}
                  >
                    <XIcon />
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <Input
          id="media-tags"
          className="h-11"
          value={tagText}
          placeholder="Ajoutez un mot-clé puis Entrée"
          onChange={(e) => (e.target.value.endsWith(",") ? addTags(e.target.value) : setTagText(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              addTags(tagText)
            }
          }}
          onBlur={() => tagText && addTags(tagText)}
        />
      </Field>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {media.width && media.height && (
          <>
            <dt className="text-muted-foreground">Dimensions</dt>
            <dd>{`${media.width} × ${media.height} px`}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Poids</dt>
        <dd>{formatBytes(media.bytes)}</dd>
        <dt className="text-muted-foreground">Ajoutée le</dt>
        <dd>{formatDay(media.createdAt)}</dd>
        {media.originalName && (
          <>
            <dt className="text-muted-foreground">Nom d'origine</dt>
            <dd className="truncate">{media.originalName}</dd>
          </>
        )}
      </dl>
      <section aria-labelledby="media-usage" className="flex flex-col gap-2">
        <h3 id="media-usage" className="font-heading">
          Utilisée sur
        </h3>
        {media.usage.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nulle part pour le moment.</p>
        ) : (
          <ul className="flex flex-col">
            {media.usage.map((use) => (
              <li key={`${use.kind}-${use.id}`}>
                <Link href={use.href} className="flex min-h-11 items-center underline-offset-4 hover:underline">
                  {use.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Field orientation="horizontal">
        <Switch id="media-keep" checked={keep} onCheckedChange={setKeep} />
        <FieldLabel htmlFor="media-keep">Garder même si elle n'est plus utilisée</FieldLabel>
      </Field>
      <div className="flex flex-col gap-3">
        <Button className="h-11" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending && <Spinner />}
          Enregistrer
        </Button>
        {bundled ? (
          <p className="text-muted-foreground text-sm">Fournie avec le site</p>
        ) : media.usageCount > 0 ? (
          <p role="status" className="text-destructive text-sm">
            {`Utilisée sur ${media.usageCount} ${media.usageCount > 1 ? "pages" : "page"} : retirez-la d'abord.`}
          </p>
        ) : null}
        {!bundled && (
          <Button
            variant="outline"
            className="h-11"
            disabled={media.usageCount > 0 || remove.isPending}
            onClick={() => setConfirming(true)}
          >
            Supprimer
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Supprimer cette photo ?"
        description="Elle sera retirée du stockage, ce qui est définitif."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => remove.mutate()}
      />
    </div>
  )
}

/** Side sheet on desktop, bottom drawer on a phone. */
export function MediaDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const mobile = useIsMobile()
  const open = id !== null
  const change = (next: boolean) => !next && onClose()
  const title = "Détail de la photo"
  if (mobile) {
    return (
      <Drawer open={open} onOpenChange={change}>
        <DrawerContent className="max-h-[90dvh]">
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription className="sr-only">
              Modifier le nom, le texte alternatif et les mots-clés
            </DrawerDescription>
          </DrawerHeader>
          {id && <DetailBody id={id} onClose={onClose} />}
        </DrawerContent>
      </Drawer>
    )
  }
  return (
    <Sheet open={open} onOpenChange={change}>
      <SheetContent className="w-full overflow-hidden sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="sr-only">Modifier le nom, le texte alternatif et les mots-clés</SheetDescription>
        </SheetHeader>
        {id && <DetailBody id={id} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  )
}
