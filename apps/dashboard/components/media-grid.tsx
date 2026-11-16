"use client"

import { CheckIcon } from "@phosphor-icons/react"
import type { Media } from "@workspace/sdk"
import { imageSrc } from "@workspace/sdk"
import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"
import { type KeyboardEvent, useRef, useState } from "react"
import { useAppConfig } from "@/components/app-config"
import { formatDay, tileEnterAction } from "@/lib/media-query"

export function MediaGrid({
  items,
  selectedIds,
  selectable,
  onActivate,
  onToggle,
  onChoose,
}: {
  items: Media[]
  selectedIds: string[]
  selectable: boolean
  /** Enter on a tile (or a click outside select mode). */
  onActivate: (media: Media) => void
  onToggle: (media: Media) => void
  /** Enter or double click in the picker. */
  onChoose?: (media: Media) => void
}) {
  const { webUrl } = useAppConfig()
  const list = useRef<HTMLUListElement>(null)
  const [active, setActive] = useState(0)
  const move = (index: number, key: string) => {
    const tiles = Array.from(list.current?.querySelectorAll<HTMLButtonElement>("button[data-tile]") ?? [])
    const columns = tiles.filter((tile) => tile.offsetTop === tiles[0]?.offsetTop).length || 1
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[key]
    if (!step) return false
    const next = Math.min(tiles.length - 1, Math.max(0, index + step))
    setActive(next)
    tiles[next]?.focus()
    return true
  }
  const onKeyDown = (event: KeyboardEvent, index: number, media: Media) => {
    if (move(index, event.key)) return event.preventDefault()
    if (event.key === "Enter") {
      event.preventDefault()
      const action = tileEnterAction({ selectable, multiple: !onChoose })
      if (action === "choose") onChoose?.(media)
      else if (action === "toggle") onToggle(media)
      else onActivate(media)
    }
  }
  return (
    <ul ref={list} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((media, index) => {
        const selected = selectedIds.includes(media.id)
        const expiring = Boolean(
          media.deletesAt && !media.keep && new Date(media.deletesAt).getTime() - Date.now() <= 7 * 86_400_000,
        )
        return (
          <li key={media.id} className="min-w-0">
            <button
              type="button"
              data-tile
              tabIndex={index === active ? 0 : -1}
              aria-pressed={selectable ? selected : undefined}
              aria-label={selectable ? media.filename : `${media.filename}, ouvrir`}
              onFocus={() => setActive(index)}
              onClick={() => (selectable ? onToggle(media) : onActivate(media))}
              onDoubleClick={() => onChoose?.(media)}
              onKeyDown={(event) => onKeyDown(event, index, media)}
              className="group flex min-h-11 w-full flex-col gap-1 text-left outline-none"
            >
              <span
                className={cn(
                  "relative block aspect-square w-full overflow-hidden border bg-muted group-focus-visible:ring-2 group-focus-visible:ring-ring",
                  selected && "ring-2 ring-primary",
                )}
              >
                {/* biome-ignore lint/performance/noImgElement: library thumbnails come from the bucket or the web origin */}
                <img
                  src={imageSrc(media.src, webUrl)}
                  alt={media.alt?.fr ?? ""}
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover"
                />
                {selected && (
                  <span className="absolute top-2 right-2 grid size-6 place-items-center bg-primary text-primary-foreground">
                    <CheckIcon weight="bold" />
                  </span>
                )}
                <span className="absolute bottom-1 left-1 flex flex-wrap gap-1">
                  {media.usageCount === 0 && !expiring && <Badge variant="secondary">Non utilisée</Badge>}
                  {expiring && media.deletesAt && (
                    <Badge variant="destructive">Supprimée le {formatDay(media.deletesAt)}</Badge>
                  )}
                  {media.keep && <Badge variant="outline">Gardée</Badge>}
                </span>
              </span>
              <span className="truncate text-sm">{media.filename}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
