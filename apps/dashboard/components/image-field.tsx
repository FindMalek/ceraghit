"use client"

import { ORPCError } from "@orpc/client"
import { ArrowDownIcon, ArrowUpIcon, ImageIcon, TrashIcon, UploadSimpleIcon } from "@phosphor-icons/react"
import { errorMessage } from "@workspace/orpc/errors"
import { browserClient } from "@workspace/orpc/react"
import { imageSrc } from "@workspace/sdk"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { useAppConfig } from "@/components/app-config"

type Folder = "products" | "categories" | "locations"
type ContentType = "image/jpeg" | "image/png" | "image/webp" | "image/avif"

const TYPES: ContentType[] = ["image/jpeg", "image/png", "image/webp", "image/avif"]

/** Uploads straight to the bucket with a signed url, so the file never passes through a serverless function. */
async function uploadFile(file: File, folder: Folder): Promise<string> {
  if (!TYPES.includes(file.type as ContentType)) throw new Error("Formats acceptés : JPG, PNG, WebP, AVIF.")
  const target = await browserClient.admin.uploads.sign({ folder, contentType: file.type as ContentType })
  const res = await fetch(target.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file })
  if (!res.ok) throw new Error("L'envoi a échoué (vérifiez le CORS du bucket).")
  return target.image
}

function uploadError(error: unknown): string {
  if (error instanceof ORPCError && error.code === "PRECONDITION_FAILED") {
    return "Le stockage d'images n'est pas configuré ici. Collez un chemin (/catalogue/…) ou une URL à la place."
  }
  return error instanceof ORPCError ? errorMessage(error) : error instanceof Error ? error.message : "Envoi impossible."
}

export function useUploader(folder: Folder) {
  const [busy, setBusy] = useState(false)
  const upload = async (files: File[]): Promise<string[]> => {
    setBusy(true)
    const done: string[] = []
    for (const file of files) {
      try {
        done.push(await uploadFile(file, folder))
      } catch (error) {
        toast.error(uploadError(error))
        break
      }
    }
    setBusy(false)
    return done
  }
  return { busy, upload }
}

function Thumb({ image, className }: { image: string | null; className?: string }) {
  const { webUrl } = useAppConfig()
  return image ? (
    // biome-ignore lint/performance/noImgElement: preview of an uploaded or static image
    <img src={imageSrc(image, webUrl)} alt="" className={`${className ?? "size-20"} shrink-0 border object-cover`} />
  ) : (
    <div className={`${className ?? "size-20"} grid shrink-0 place-items-center border text-muted-foreground`}>
      <ImageIcon className="size-6" />
    </div>
  )
}

function PathInput({ onAdd }: { onAdd: (value: string) => void }) {
  const [text, setText] = useState("")
  const add = () => {
    const value = text.trim()
    if (!value) return
    if (!value.startsWith("/") && !value.startsWith("http") && !value.startsWith("s3:")) {
      toast.error("Un chemin commence par /, une URL par https://.")
      return
    }
    onAdd(value)
    setText("")
  }
  return (
    <div className="flex gap-2">
      <Input
        className="h-11"
        placeholder="…ou collez un chemin (/catalogue/0010-1.webp) ou une URL"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            add()
          }
        }}
      />
      <Button type="button" variant="outline" className="h-11" onClick={add}>
        Ajouter
      </Button>
    </div>
  )
}

/** One image (category, location): preview, upload or paste a path, remove. */
export function ImageField({
  folder,
  value,
  onChange,
}: {
  folder: Folder
  value: string | null | undefined
  onChange: (value: string | null) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const { busy, upload } = useUploader(folder)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <Thumb image={value ?? null} className="size-24" />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy ? <Spinner /> : <UploadSimpleIcon />}
            {value ? "Changer la photo" : "Ajouter une photo"}
          </Button>
          {value && (
            <Button type="button" variant="ghost" className="h-11" onClick={() => onChange(null)}>
              <TrashIcon />
              Retirer
            </Button>
          )}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept={TYPES.join(",")}
        hidden
        onChange={async (event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ""
          const [uploaded] = await upload(files.slice(0, 1))
          if (uploaded) onChange(uploaded)
        }}
      />
      <PathInput onAdd={onChange} />
    </div>
  )
}

export interface ImageItem {
  image: string
  alt?: string | null
}

/** The product gallery: first image is the cover, reorder with the arrows. */
export function ImageListField({ value, onChange }: { value: ImageItem[]; onChange: (value: ImageItem[]) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const { busy, upload } = useUploader("products")
  const move = (index: number, delta: number) => {
    const next = [...value]
    const [item] = next.splice(index, 1)
    next.splice(index + delta, 0, item as ImageItem)
    onChange(next)
  }
  return (
    <div className="flex flex-col gap-3">
      {value.length === 0 && <p className="text-muted-foreground text-sm">Aucune photo pour le moment.</p>}
      <ul className="flex flex-col gap-2">
        {value.map((item, index) => (
          <li key={`${item.image}-${index}`} className="frame flex items-center gap-3 bg-card/60 p-2">
            <Thumb image={item.image} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{item.image}</p>
              {index === 0 && <p className="text-gold text-sm">Photo principale</p>}
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Monter"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUpIcon />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Descendre"
                disabled={index === value.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDownIcon />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Retirer la photo"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                <TrashIcon />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full sm:w-fit"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? <Spinner /> : <UploadSimpleIcon />}
        Ajouter des photos
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        accept={TYPES.join(",")}
        hidden
        onChange={async (event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ""
          const uploaded = await upload(files)
          if (uploaded.length) onChange([...value, ...uploaded.map((image) => ({ image }))])
        }}
      />
      <PathInput onAdd={(image) => onChange([...value, { image }])} />
    </div>
  )
}
