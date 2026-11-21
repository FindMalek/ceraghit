"use client"

import { ImagesIcon } from "@phosphor-icons/react"
import { imageSrc } from "@workspace/sdk"
import { Button } from "@workspace/ui/components/button"
import Link from "next/link"
import { useState } from "react"
import { useAppConfig } from "@/components/app-config"
import { MediaPicker } from "@/components/media-picker"

export interface PickedImage {
  /** Preview and legacy value. */
  image: string | null
  /** `undefined`: untouched (a picture from before the library), `null`: removed. */
  imageMediaId: string | null | undefined
}

/** One picture of a category or location: picked from the media library (or uploaded in the picker), never pasted. */
export function MediaImageField({
  value,
  aspect = "1/1",
  onChange,
}: {
  value: PickedImage
  aspect?: string
  onChange: (value: PickedImage) => void
}) {
  const { webUrl } = useAppConfig()
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <div className="w-24 shrink-0 overflow-hidden border bg-muted" style={{ aspectRatio: aspect }}>
          {value.image ? (
            // biome-ignore lint/performance/noImgElement: preview of a library photo
            <img src={imageSrc(value.image, webUrl)} alt="" className="size-full object-cover" />
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={() => setOpen(true)}>
            <ImagesIcon />
            {value.image ? "Changer la photo" : "Choisir une photo"}
          </Button>
          {value.image && (
            <Button
              type="button"
              variant="ghost"
              className="h-11"
              onClick={() => onChange({ image: null, imageMediaId: null })}
            >
              Retirer
            </Button>
          )}
        </div>
      </div>
      <Link href="/media" className="text-muted-foreground text-sm underline-offset-4 hover:underline" target="_blank">
        Modifier le texte alternatif dans la médiathèque
      </Link>
      {open && (
        <MediaPicker
          open
          onOpenChange={(next) => !next && setOpen(false)}
          onSelect={(picked) => {
            const m = picked[0]
            if (m) onChange({ image: m.src, imageMediaId: m.id })
          }}
        />
      )}
    </div>
  )
}
