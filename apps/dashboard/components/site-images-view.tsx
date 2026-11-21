"use client"

import { ArrowSquareOutIcon, DotsThreeIcon, ImagesIcon } from "@phosphor-icons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { imageSrc, SITE_SLOT_KEYS, SITE_SLOTS, type SiteSlot } from "@workspace/sdk"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { showError } from "@workspace/ui/components/error-banner"
import { Spinner } from "@workspace/ui/components/spinner"
import { useEffect, useState } from "react"
import { useAppConfig } from "@/components/app-config"
import { MediaPicker } from "@/components/media-picker"
import { PageBody, PageHeader } from "@/components/page-header"
import { AltDialog } from "@/components/product-gallery-field"
import { ErrorState, LoadingRows } from "@/components/query-state"
import { errorMessage } from "@/lib/errors"
import { moveItem, type SlotItem, slotError, slotItemFromMedia, willCrop } from "@/lib/site-slot"

const HELP: Record<SiteSlot, string> = {
  hero: "Les photos qui défilent en haut de la page d'accueil. La première s'affiche en premier.",
  studio: "Les photos de l'atelier, sur l'accueil et la page Atelier.",
  process: "Les étapes de fabrication, sur la page Atelier.",
  logo: "Le médaillon affiché en haut du site et dans l'onglet du navigateur.",
  "og-home": "L'image affichée quand on partage la page d'accueil sur WhatsApp, Facebook… Format conseillé 1200 × 630.",
  "og-shop": "L'image affichée quand on partage la boutique. Format conseillé 1200 × 630.",
  "og-atelier": "L'image affichée quand on partage la page Atelier. Format conseillé 1200 × 630.",
  "og-custom": "L'image affichée quand on partage la page Sur mesure. Format conseillé 1200 × 630.",
  texture: "Le grain de papier en fond de page.",
}

type ServerItem = {
  mediaId: string
  image: string
  alt: SlotItem["alt"]
  visible: boolean
  width: number | null
  height: number | null
}

const toDraft = (items: ServerItem[]): SlotItem[] => items.map((i) => ({ ...i, libraryAlt: null }))
const sameDraft = (a: SlotItem[], b: SlotItem[]) =>
  JSON.stringify(a.map(({ mediaId, alt, visible }) => [mediaId, alt, visible])) ===
  JSON.stringify(b.map(({ mediaId, alt, visible }) => [mediaId, alt, visible]))

function Tile({
  slot,
  item,
  index,
  total,
  onChange,
}: {
  slot: SiteSlot
  item: SlotItem
  index: number
  total: number
  onChange: (next: SlotItem[] | ((list: SlotItem[]) => SlotItem[])) => void
}) {
  const { webUrl } = useAppConfig()
  const [picking, setPicking] = useState(false)
  const [altOpen, setAltOpen] = useState(false)
  const rule = SITE_SLOTS[slot]
  const n = index + 1
  const patch = (p: Partial<SlotItem>) => onChange((list) => list.map((it, i) => (i === index ? { ...it, ...p } : it)))
  return (
    <li className="frame flex flex-col bg-card/60" data-testid={`${slot}-tile`} data-visible={item.visible}>
      <div className="relative overflow-hidden" style={{ aspectRatio: rule.aspect ?? "1/1" }}>
        {/* biome-ignore lint/performance/noImgElement: preview of a library photo */}
        <img
          src={imageSrc(item.image, webUrl)}
          alt=""
          className={`size-full object-cover ${item.visible ? "" : "opacity-40"}`}
        />
        {!item.visible && <Badge className="absolute start-2 top-2">Masquée</Badge>}
      </div>
      {willCrop(slot, item) && <p className="px-2 pt-1 text-muted-foreground text-xs">Cette photo sera recadrée.</p>}
      <div className="flex items-center justify-between gap-1 p-1">
        <span className="ps-2 text-muted-foreground text-sm tabular-nums">{n}</span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-11"
                aria-label={`Actions pour ${rule.label} ${n}`}
              />
            }
          >
            <DotsThreeIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="min-h-11" onClick={() => setPicking(true)}>
              Remplacer…
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11" onClick={() => setAltOpen(true)}>
              Texte alternatif…
            </DropdownMenuItem>
            {rule.multiple && (
              <>
                <DropdownMenuItem className="min-h-11" onClick={() => patch({ visible: !item.visible })}>
                  {item.visible ? "Masquer" : "Afficher"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="min-h-11"
                  disabled={index === 0}
                  onClick={() => onChange((l) => moveItem(l, index, index - 1))}
                >
                  Monter
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="min-h-11"
                  disabled={index === total - 1}
                  onClick={() => onChange((l) => moveItem(l, index, index + 1))}
                >
                  Descendre
                </DropdownMenuItem>
              </>
            )}
            {rule.min === 0 && (
              <DropdownMenuItem className="min-h-11" onClick={() => onChange((l) => l.filter((_, i) => i !== index))}>
                {rule.multiple ? "Retirer" : "Revenir à l'image par défaut"}
              </DropdownMenuItem>
            )}
            {rule.min > 0 && total > rule.min && (
              <DropdownMenuItem className="min-h-11" onClick={() => onChange((l) => l.filter((_, i) => i !== index))}>
                Retirer
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {picking && (
        <MediaPicker
          open
          onOpenChange={(open) => !open && setPicking(false)}
          onSelect={(picked) => {
            const m = picked[0]
            if (m) patch({ ...slotItemFromMedia(m), visible: item.visible })
          }}
        />
      )}
      {altOpen && (
        <AltDialog
          item={item}
          onClose={() => setAltOpen(false)}
          onSave={(alt) => {
            patch({ alt })
            setAltOpen(false)
          }}
        />
      )}
    </li>
  )
}

function Section({ slot, server }: { slot: SiteSlot; server: ServerItem[] }) {
  const rule = SITE_SLOTS[slot]
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<SlotItem[]>(() => toDraft(server))
  const [picker, setPicker] = useState(false)
  const [saved, setSaved] = useState(false)
  const base = toDraft(server)
  const serverKey = JSON.stringify(server)
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the saved content really changes
  useEffect(() => setDraft(toDraft(server)), [serverKey])
  const dirty = !sameDraft(draft, base)
  const error = slotError(slot, draft)
  const save = useMutation(
    orpc.admin.site.saveSlot.mutationOptions({
      onSuccess: () => {
        setSaved(true)
        queryClient.invalidateQueries({ queryKey: orpc.admin.site.key() })
        queryClient.invalidateQueries({ queryKey: orpc.admin.media.key() })
      },
      onError: (e) => showError(errorMessage(e)),
    }),
  )
  const change = (next: SlotItem[] | ((list: SlotItem[]) => SlotItem[])) => {
    setSaved(false)
    setDraft(next)
  }
  const full = draft.length >= rule.max
  return (
    <section id={slot} aria-labelledby={`${slot}-title`} className="flex flex-col gap-3 scroll-mt-4">
      <div>
        <h2 id={`${slot}-title`} className="font-heading text-xl">
          {rule.label}
        </h2>
        <p className="text-muted-foreground text-sm">{HELP[slot]}</p>
      </div>
      {draft.length === 0 ? (
        <p className="text-muted-foreground text-sm">Image par défaut du site.</p>
      ) : (
        <ul
          className={rule.multiple ? "grid grid-cols-2 gap-3 md:grid-cols-4" : "grid max-w-xs grid-cols-1 gap-3"}
          aria-label={rule.label}
        >
          {draft.map((item, index) => (
            <Tile key={item.mediaId} slot={slot} item={item} index={index} total={draft.length} onChange={change} />
          ))}
        </ul>
      )}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 bg-background/90 py-2 backdrop-blur">
        {(rule.multiple || draft.length === 0) && (
          <Button type="button" variant="outline" className="h-11" disabled={full} onClick={() => setPicker(true)}>
            <ImagesIcon />
            {rule.multiple ? "Choisir dans la médiathèque" : "Choisir une photo"}
          </Button>
        )}
        <Button
          type="button"
          className="h-11"
          disabled={!dirty || Boolean(error) || save.isPending}
          onClick={() =>
            save.mutate({
              slot,
              images: draft.map((i) => ({ mediaId: i.mediaId, alt: i.alt, visible: i.visible })),
            })
          }
        >
          {save.isPending ? <Spinner /> : null}
          Enregistrer
        </Button>
        {dirty && <p className="text-muted-foreground text-sm">Modifications non enregistrées</p>}
        {saved && !dirty && (
          <p className="text-muted-foreground text-sm" role="status">
            Images enregistrées.
          </p>
        )}
        {error && <p className="text-destructive text-sm">{error}</p>}
        {rule.multiple && (
          <p className="text-muted-foreground text-sm tabular-nums">
            {draft.length} / {rule.max} photos
          </p>
        )}
      </div>
      {picker && (
        <MediaPicker
          open
          onOpenChange={(open) => !open && setPicker(false)}
          multiple={rule.multiple}
          max={rule.multiple ? rule.max - draft.length : undefined}
          onSelect={(picked) =>
            change((list) => {
              const fresh = picked.filter((m) => !list.some((i) => i.mediaId === m.id)).map(slotItemFromMedia)
              return rule.multiple ? [...list, ...fresh].slice(0, rule.max) : fresh.slice(0, 1)
            })
          }
        />
      )}
    </section>
  )
}

export function SiteImagesView() {
  const { webUrl } = useAppConfig()
  const images = useQuery(orpc.admin.site.images.queryOptions())
  return (
    <>
      <PageHeader
        title="Images du site"
        description="Les photos du site vitrine : accueil, atelier, logo, partage et fond."
        actions={
          webUrl ? (
            <a
              href={webUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-1 text-sm underline-offset-4 hover:underline"
            >
              Voir sur le site <ArrowSquareOutIcon aria-hidden />
            </a>
          ) : undefined
        }
      />
      <PageBody>
        {images.isLoading ? (
          <LoadingRows />
        ) : images.isError || !images.data ? (
          <ErrorState error={images.error} onRetry={() => images.refetch()} />
        ) : (
          <div className="flex flex-col gap-10">
            {SITE_SLOT_KEYS.map((slot) => (
              <Section key={slot} slot={slot} server={images.data[slot] ?? []} />
            ))}
          </div>
        )}
      </PageBody>
    </>
  )
}
