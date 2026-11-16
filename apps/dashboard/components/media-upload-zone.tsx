"use client"

import { ORPCError } from "@orpc/client"
import { UploadSimpleIcon } from "@phosphor-icons/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import type { Media } from "@workspace/sdk"
import { Button } from "@workspace/ui/components/button"
import { Progress } from "@workspace/ui/components/progress"
import { useRef, useState } from "react"
import { errorMessage } from "@/lib/errors"
import { type UploadPhase, uploadMedia } from "@/lib/upload-media"

const PHASE_TEXT: Record<UploadPhase, string> = {
  compress: "Compression…",
  send: "Envoi…",
  check: "Vérification…",
  done: "Ajoutée",
  existing: "Déjà dans la bibliothèque",
  error: "Échec",
}
const PROGRESS: Record<UploadPhase, number> = {
  compress: 20,
  send: 60,
  check: 85,
  done: 100,
  existing: 100,
  error: 100,
}
const PARALLEL = 3
const FULL_MESSAGE = "L'espace de stockage (2,5 Go) est plein. Supprimez des photos inutilisées."

interface Row {
  id: number
  name: string
  phase: UploadPhase
  error?: string
}

export function MediaUploadZone({ onUploaded }: { onUploaded?: (media: Media[]) => void }) {
  const queryClient = useQueryClient()
  const usage = useQuery(orpc.admin.uploads.usage.queryOptions())
  const full = usage.data ? usage.data.usedBytes >= usage.data.quotaBytes : false
  const [rows, setRows] = useState<Row[]>([])
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const counter = useRef(0)
  const patch = (id: number, change: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...change } : row)))

  const run = async (files: File[]) => {
    const jobs = files.map((file) => ({ file, id: ++counter.current }))
    setRows((current) => [
      ...jobs.map(({ file, id }) => ({ id, name: file.name, phase: "compress" as const })),
      ...current,
    ])
    const done: Media[] = []
    const queue = [...jobs]
    const worker = async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        try {
          done.push(await uploadMedia(job.file, (phase) => patch(job.id, { phase })))
        } catch (error) {
          const message =
            error instanceof ORPCError
              ? errorMessage(error)
              : error instanceof Error
                ? error.message
                : "Envoi impossible."
          patch(job.id, { phase: "error", error: message })
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(PARALLEL, jobs.length) }, worker))
    await Promise.all(
      [orpc.admin.media.list, orpc.admin.media.tags, orpc.admin.uploads.usage].map((procedure) =>
        queryClient.invalidateQueries({ queryKey: procedure.key() }),
      ),
    )
    if (done.length) onUploaded?.(done)
  }

  const pick = (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((file) => file.type.startsWith("image/"))
    if (files.length) void run(files)
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-label="Ajouter des photos"
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          if (!full) pick(event.dataTransfer.files)
        }}
        className={`frame flex flex-col items-center gap-3 border-dashed p-6 text-center ${dragging ? "bg-accent" : "bg-card/60"}`}
      >
        <p className="text-muted-foreground text-sm">
          {full ? FULL_MESSAGE : "Glissez vos photos ici, ou choisissez-les sur cet appareil."}
        </p>
        <Button type="button" className="h-11" disabled={full} onClick={() => input.current?.click()}>
          <UploadSimpleIcon />
          Ajouter des photos
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          accept="image/*"
          hidden
          aria-label="Choisir des photos"
          onChange={(event) => {
            pick(event.target.files)
            event.target.value = ""
          }}
        />
      </div>
      <ul className="flex flex-col gap-2" aria-live="polite">
        {rows.map((row) => (
          <li key={row.id} className="frame flex flex-col gap-1 bg-card/60 p-3">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{row.name}</span>
              <span className={row.phase === "error" ? "shrink-0 text-destructive" : "shrink-0 text-muted-foreground"}>
                {row.phase === "error" ? row.error : PHASE_TEXT[row.phase]}
              </span>
            </div>
            <Progress value={PROGRESS[row.phase]} aria-label={`${row.name} : ${PHASE_TEXT[row.phase]}`} />
          </li>
        ))}
      </ul>
    </div>
  )
}
