"use client"

import { HourglassMediumIcon, XIcon } from "@phosphor-icons/react"
import {
  formatTutorialLength,
  relatedTutorials,
  TUTORIAL_AREA_LABELS,
  TUTORIALS,
  type Tutorial,
  type TutorialDevice,
  type TutorialFiles,
  type TutorialLink,
  tutorialKeys,
} from "@workspace/sdk"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@workspace/ui/components/dialog"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { cn } from "@workspace/ui/lib/utils"
import { useState } from "react"

export const DEVICE_LABELS: Record<TutorialDevice, string> = { desktop: "Ordinateur", mobile: "Téléphone" }

export type VideoSource = { kind: "youtube"; id: string } | { kind: "file" }

/** Where a video plays from on one device: the owner's YouTube link first, then the hosted file. */
export function sourceFor(device: TutorialDevice, files: TutorialFiles | undefined, link: TutorialLink | undefined) {
  const youtube = link?.[device]
  if (youtube) return { kind: "youtube", id: youtube } satisfies VideoSource
  return files?.[device] ? ({ kind: "file" } satisfies VideoSource) : null
}

/** Same-origin url of a file in the bucket: the dashboard proxy forwards /api/files/* and the api redirects to storage. */
export const fileUrl = (prefix: string, key: string) => `/api/files/${prefix}${key}`

function Player({
  tutorial,
  files,
  link,
  prefix,
  onSelect,
}: {
  tutorial: Tutorial
  files: TutorialFiles | undefined
  link: TutorialLink | undefined
  prefix: string
  onSelect: (id: string) => void
}) {
  const isMobile = useIsMobile()
  const [chosen, setChosen] = useState<TutorialDevice | null>(null)
  const available = tutorial.devices.filter((d) => sourceFor(d, files, link))
  const preferred: TutorialDevice = chosen ?? (isMobile ? "mobile" : "desktop")
  const device = available.includes(preferred) ? preferred : (available[0] ?? null)
  const source = device ? sourceFor(device, files, link) : null
  const keys = device ? tutorialKeys(tutorial.id, device) : null
  const related = relatedTutorials(tutorial, TUTORIALS)

  return (
    <>
      <div className="flex flex-col gap-1.5 pr-12">
        <DialogTitle className="text-2xl leading-tight">{tutorial.title}</DialogTitle>
        <DialogDescription>{tutorial.description}</DialogDescription>
      </div>

      {available.length > 1 && (
        <div role="group" aria-label="Version de la vidéo" className="flex gap-2">
          {available.map((d) => (
            <Button
              key={d}
              type="button"
              size="sm"
              variant={d === device ? "default" : "outline"}
              aria-pressed={d === device}
              className="h-10"
              onClick={() => setChosen(d)}
            >
              {DEVICE_LABELS[d]}
            </Button>
          ))}
        </div>
      )}

      {source?.kind === "file" && device && keys && (
        // biome-ignore lint/a11y/useMediaCaption: the French captions are the track below, when the file has them
        <video
          key={`${tutorial.id}-${device}`}
          controls
          playsInline
          preload="metadata"
          poster={files?.poster ? fileUrl(prefix, keys.poster) : undefined}
          src={fileUrl(prefix, keys.video)}
          aria-label={tutorial.title}
          className={cn(
            "mx-auto block bg-black",
            device === "mobile" ? "aspect-[9/19.5] max-h-[60svh] w-auto max-w-full" : "aspect-video w-full",
          )}
        >
          {files?.captions && (
            <track kind="captions" srcLang="fr" label="Français" src={fileUrl(prefix, keys.captions)} default />
          )}
        </video>
      )}
      {source?.kind === "youtube" && (
        <div className={cn("bg-black", device === "mobile" && "flex justify-center")}>
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${source.id}?rel=0&playsinline=1`}
            title={tutorial.title}
            loading="lazy"
            allow="encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className={cn(
              "block border-0",
              device === "mobile" ? "aspect-[9/19.5] h-auto max-h-[60svh] w-auto max-w-full" : "aspect-video w-full",
            )}
          />
        </div>
      )}
      {!source && (
        <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-muted/60 px-6 text-center text-muted-foreground">
          <HourglassMediumIcon className="size-8" />
          <p className="font-medium text-foreground">Vidéo bientôt disponible</p>
          <p className="text-sm">
            {tutorial.status === "soon"
              ? "Cette fonction n'est pas encore en ligne."
              : "Elle apparaîtra ici dès qu'elle sera prête."}
          </p>
        </div>
      )}

      <p className="text-muted-foreground text-sm">
        {TUTORIAL_AREA_LABELS[tutorial.area]} · {formatTutorialLength(tutorial.lengthSeconds)}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {tutorial.tags.map((tag) => (
          <Badge key={tag} variant="secondary">
            {tag}
          </Badge>
        ))}
      </div>

      {related.length > 0 && (
        <section aria-labelledby="related-title" className="flex flex-col gap-2 border-t pt-4">
          <h3 id="related-title" className="text-lg">
            Vidéos liées
          </h3>
          <ul className="flex flex-col">
            {related.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onSelect(r.id)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span>{r.title}</span>
                  <span className="shrink-0 text-muted-foreground text-sm">
                    {formatTutorialLength(r.lengthSeconds)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

/** The player dialog: Esc and the close button leave, focus goes back to the card that opened it. */
export function TutorialPlayerDialog({
  tutorial,
  files,
  link,
  prefix,
  onClose,
  onSelect,
}: {
  tutorial: Tutorial | null
  files: TutorialFiles | undefined
  link: TutorialLink | undefined
  prefix: string
  onClose: () => void
  onSelect: (id: string) => void
}) {
  return (
    <Dialog open={tutorial !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-3xl"
        data-testid="tutorial-player"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Fermer"
          className="absolute top-4 right-4 size-10"
          onClick={onClose}
        >
          <XIcon />
        </Button>
        {tutorial && (
          <Player key={tutorial.id} tutorial={tutorial} files={files} link={link} prefix={prefix} onSelect={onSelect} />
        )}
      </DialogContent>
    </Dialog>
  )
}
