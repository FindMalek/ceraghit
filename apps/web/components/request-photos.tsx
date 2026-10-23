"use client"

import { Camera, X } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import { useTranslations } from "next-intl"
import { type ChangeEvent, useEffect, useRef, useState } from "react"
import { PhotoError, uploadPhoto } from "@/lib/photo-upload"

const MAX_PHOTOS = 3

interface Photo {
  id: string
  preview: string
  status: "uploading" | "done" | "error"
  image?: string
  error?: string
}

/** Up to 3 photos, uploaded as soon as they are picked. Reports the saved keys and whether an upload is running. */
export function RequestPhotos({ onChange }: { onChange: (images: string[], busy: boolean) => void }) {
  const t = useTranslations("custom")
  const [photos, setPhotos] = useState<Photo[]>([])
  const [unavailable, setUnavailable] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const previews = useRef<string[]>([])

  useEffect(() => {
    onChange(
      photos.flatMap((p) => (p.image ? [p.image] : [])),
      photos.some((p) => p.status === "uploading"),
    )
  }, [photos, onChange])

  useEffect(
    () => () => {
      for (const url of previews.current) URL.revokeObjectURL(url)
    },
    [],
  )

  if (unavailable) return null

  const patch = (id: string, next: Partial<Photo>) =>
    setPhotos((all) => all.map((p) => (p.id === id ? { ...p, ...next } : p)))

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])].slice(0, MAX_PHOTOS - photos.length)
    event.target.value = ""
    for (const file of files) {
      const id = crypto.randomUUID()
      const preview = URL.createObjectURL(file)
      previews.current.push(preview)
      setPhotos((all) => [...all, { id, preview, status: "uploading" }])
      uploadPhoto(file)
        .then((image) => patch(id, { status: "done", image }))
        .catch((error: unknown) => {
          const kind = error instanceof PhotoError ? error.kind : "failed"
          if (kind === "unavailable") {
            setUnavailable(true)
            setPhotos([])
            return
          }
          patch(id, { status: "error", error: t(`photoErrors.${kind}`) })
        })
    }
  }

  return (
    <fieldset className="space-y-3">
      <legend className="font-heading text-sm">{t("photos")}</legend>
      <p className="text-muted-foreground text-xs">{t("photosHint")}</p>
      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-3">
          {photos.map((photo) => (
            <li key={photo.id} className="frame relative aspect-square overflow-hidden">
              {/* biome-ignore lint/performance/noImgElement: a local blob preview */}
              <img src={photo.preview} alt="" className="size-full object-cover" />
              {photo.status === "uploading" && (
                <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                  <Spinner />
                  <span className="sr-only">{t("photoUploading")}</span>
                </span>
              )}
              {photo.status === "error" && (
                <span className="absolute inset-x-0 bottom-0 bg-destructive/90 p-1 text-center text-[11px] text-white">
                  {photo.error}
                </span>
              )}
              <button
                type="button"
                onClick={() => setPhotos((all) => all.filter((p) => p.id !== photo.id))}
                aria-label={t("removePhoto")}
                className="absolute end-1 top-1 flex size-8 items-center justify-center bg-background/80 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {photos.length < MAX_PHOTOS && (
        <>
          <input
            ref={input}
            id="request-photos"
            aria-label={t("addPhotos")}
            tabIndex={-1}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            multiple
            className="sr-only"
            onChange={pick}
          />
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-11 gap-2"
            onClick={() => input.current?.click()}
          >
            <Camera aria-hidden className="size-5" />
            {t("addPhotos")}
          </Button>
        </>
      )}
    </fieldset>
  )
}
