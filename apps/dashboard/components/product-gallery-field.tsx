"use client"

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { DotsSixVerticalIcon, DotsThreeIcon, ImagesIcon, StarIcon, UploadSimpleIcon } from "@phosphor-icons/react"
import { imageSrc, type Media } from "@workspace/sdk"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { useState } from "react"
import { useAppConfig } from "@/components/app-config"
import { LocalizedField } from "@/components/localized-field"
import { MediaPicker } from "@/components/media-picker"
import { MediaUploadZone } from "@/components/media-upload-zone"
import { StorageUsage } from "@/components/storage-usage"
import { addImages, GALLERY_MAX, type GalleryItem, moveImage, removeImage, replaceImage, setMain } from "@/lib/gallery"
import { fromLocalizedDraft, type LocalizedDraft, toLocalizedDraft } from "@/lib/localized"

const INSTRUCTIONS =
  "Appuyez sur espace pour saisir la photo, les flèches pour la déplacer, espace pour la déposer, Échap pour annuler."

function Tile({
  item,
  index,
  total,
  onMove,
  onMain,
  onReplace,
  onAlt,
  onRemove,
}: {
  item: GalleryItem
  index: number
  total: number
  onMove: (to: number) => void
  onMain: () => void
  onReplace: () => void
  onAlt: () => void
  onRemove: () => void
}) {
  const { webUrl } = useAppConfig()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.mediaId,
  })
  const n = index + 1
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`frame relative flex flex-col bg-card/60 ${isDragging ? "z-10 opacity-80 ring-2 ring-primary" : ""}`}
    >
      <div className="relative aspect-square overflow-hidden">
        {/* biome-ignore lint/performance/noImgElement: preview of a library photo */}
        <img src={imageSrc(item.image, webUrl)} alt="" className="size-full object-cover" draggable={false} />
        {item.isMain && (
          <Badge className="absolute start-2 top-2" data-testid="main-badge">
            Principale
          </Badge>
        )}
      </div>
      <div className="flex items-center justify-between gap-1 p-1">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-11 touch-none"
          ref={setActivatorNodeRef}
          aria-label={`Déplacer la photo ${n}`}
          {...attributes}
          {...listeners}
        >
          <DotsSixVerticalIcon />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-11"
          aria-pressed={item.isMain}
          aria-label={item.isMain ? "Photo principale" : "Choisir comme photo principale"}
          onClick={onMain}
        >
          <StarIcon weight={item.isMain ? "fill" : "regular"} className={item.isMain ? "text-gold" : undefined} />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" size="icon" variant="ghost" className="size-11" aria-label={`Actions pour la photo ${n}`} />}
          >
            <DotsThreeIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="min-h-11" onClick={onReplace}>
              Remplacer…
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11" onClick={onAlt}>
              Texte alternatif…
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11" disabled={index === 0} onClick={() => onMove(index - 1)}>
              Monter
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11" disabled={index === total - 1} onClick={() => onMove(index + 1)}>
              Descendre
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11" onClick={onRemove}>
              Retirer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}

function AltDialog({
  item,
  onClose,
  onSave,
}: {
  item: GalleryItem | null
  onClose: () => void
  onSave: (alt: GalleryItem["alt"]) => void
}) {
  const [draft, setDraft] = useState<LocalizedDraft>(() => toLocalizedDraft(item?.alt))
  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Texte alternatif</DialogTitle>
          <DialogDescription>
            Décrit la photo pour les personnes qui ne la voient pas. Vide : le texte de la médiathèque est utilisé
            {item?.libraryAlt?.fr ? ` (« ${item.libraryAlt.fr} »)` : ""}.
          </DialogDescription>
        </DialogHeader>
        <LocalizedField id="gallery-alt" label="Texte alternatif" value={draft} onChange={setDraft} />
        <DialogFooter>
          <Button type="button" variant="outline" className="h-11" onClick={onClose}>
            Annuler
          </Button>
          <Button
            type="button"
            className="h-11"
            onClick={() => onSave(draft.fr.trim() ? fromLocalizedDraft(draft) : null)}
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Product photos: drag (or use the menu) to reorder, star the main one, add from the library. */
export function ProductGalleryField({
  value,
  onChange,
}: {
  value: GalleryItem[]
  onChange: (value: GalleryItem[]) => void
}) {
  const [picker, setPicker] = useState<"add" | number | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [altIndex, setAltIndex] = useState<number | null>(null)
  const [status, setStatus] = useState("")
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const position = (id: unknown) => value.findIndex((i) => i.mediaId === id) + 1
  const move = (from: number, to: number) => {
    onChange(moveImage(value, from, to))
    setStatus(`Photo ${from + 1} déplacée en position ${to + 1}.`)
  }
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = value.findIndex((i) => i.mediaId === active.id)
    const to = value.findIndex((i) => i.mediaId === over.id)
    onChange(arrayMove(value, from, to))
  }
  const full = value.length >= GALLERY_MAX
  return (
    <div className="flex flex-col gap-3">
      {value.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucune photo. Ajoutez-en au moins une pour publier.</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{
            screenReaderInstructions: { draggable: INSTRUCTIONS },
            announcements: {
              onDragStart: ({ active }) => `Photo ${position(active.id)} saisie.`,
              onDragOver: ({ active, over }) =>
                over ? `Photo ${position(active.id)} déplacée en position ${position(over.id)}.` : undefined,
              onDragEnd: ({ active, over }) =>
                `Photo ${position(active.id)} déposée en position ${position(over?.id ?? active.id)}.`,
              onDragCancel: () => "Déplacement annulé.",
            },
          }}
        >
          <SortableContext items={value.map((i) => i.mediaId)} strategy={rectSortingStrategy}>
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Photos du produit">
              {value.map((item, index) => (
                <Tile
                  key={item.mediaId}
                  item={item}
                  index={index}
                  total={value.length}
                  onMove={(to) => move(index, to)}
                  onMain={() => {
                    onChange(setMain(value, item.mediaId))
                    setStatus(`Photo ${index + 1} choisie comme photo principale.`)
                  }}
                  onReplace={() => setPicker(index)}
                  onAlt={() => setAltIndex(index)}
                  onRemove={() => {
                    onChange(removeImage(value, index))
                    setStatus(`Photo ${index + 1} retirée.`)
                  }}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      <p className="sr-only" aria-live="polite">
        {status}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" className="h-11" disabled={full} onClick={() => setPicker("add")}>
          <ImagesIcon />
          Choisir dans la médiathèque
        </Button>
        <Button type="button" variant="outline" className="h-11" disabled={full} onClick={() => setUploadOpen(true)}>
          <UploadSimpleIcon />
          Envoyer des photos
        </Button>
        <p className="text-muted-foreground text-sm tabular-nums">
          {value.length} / {GALLERY_MAX} photos
        </p>
      </div>
      <StorageUsage compact />
      {picker !== null && (
        <MediaPicker
          open
          onOpenChange={(open) => !open && setPicker(null)}
          multiple={picker === "add"}
          max={picker === "add" ? GALLERY_MAX - value.length : undefined}
          selectedIds={[]}
          onSelect={(picked: Media[]) => {
            if (picker === "add") onChange(addImages(value, picked))
            else if (picked[0]) onChange(replaceImage(value, picker, picked[0]))
          }}
        />
      )}
      {uploadOpen && (
        <Dialog open onOpenChange={(open) => !open && setUploadOpen(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Envoyer des photos</DialogTitle>
              <DialogDescription>Les photos sont ajoutées à la médiathèque puis à ce produit.</DialogDescription>
            </DialogHeader>
            <MediaUploadZone
              onUploaded={(picked) => {
                if (picked.length) onChange(addImages(value, picked))
                if (value.length + picked.length >= GALLERY_MAX) setUploadOpen(false)
              }}
            />
            <DialogFooter>
              <Button type="button" variant="outline" className="h-11" onClick={() => setUploadOpen(false)}>
                Fermer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {altIndex !== null && value[altIndex] && (
        <AltDialog
          key={value[altIndex].mediaId}
          item={value[altIndex]}
          onClose={() => setAltIndex(null)}
          onSave={(alt) => {
            onChange(value.map((it, i) => (i === altIndex ? { ...it, alt } : it)))
            setAltIndex(null)
          }}
        />
      )}
    </div>
  )
}
