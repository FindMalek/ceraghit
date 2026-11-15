"use client"

import { HourglassMediumIcon, PencilSimpleIcon, PlayIcon } from "@phosphor-icons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import {
  formatTutorialLength,
  TUTORIALS,
  type Tutorial,
  type TutorialLink,
  type TutorialLinks,
  tutorialLinksSchema,
  youtubeId,
} from "@workspace/sdk"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { showError } from "@workspace/ui/components/error-banner"
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { Spinner } from "@workspace/ui/components/spinner"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { cn } from "@workspace/ui/lib/utils"
import { type FormEvent, useState } from "react"
import { PageBody, PageHeader } from "@/components/page-header"
import { errorMessage } from "@/lib/errors"

type Device = "desktop" | "mobile"
type Drafts = Record<string, Record<Device, string>>

const DEVICES: { key: Device; label: string }[] = [
  { key: "desktop", label: "Ordinateur" },
  { key: "mobile", label: "Téléphone" },
]

function TutorialPlayer({ tutorial, links }: { tutorial: Tutorial; links: TutorialLink }) {
  const isMobile = useIsMobile()
  const [playing, setPlaying] = useState(false)
  const preferred: Device = isMobile ? "mobile" : "desktop"
  const device: Device | null = links[preferred]
    ? preferred
    : links.desktop
      ? "desktop"
      : links.mobile
        ? "mobile"
        : null

  if (!device) {
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-muted/60 px-6 text-center text-muted-foreground">
        <HourglassMediumIcon className="size-8" />
        <p className="font-medium text-foreground">Vidéo bientôt disponible</p>
        <p className="text-sm">Elle apparaîtra ici dès qu'elle sera prête.</p>
      </div>
    )
  }

  const id = links[device]!
  if (!playing) {
    return (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        aria-label={`Regarder : ${tutorial.title}`}
        className="group relative flex aspect-video w-full flex-col items-center justify-center gap-3 bg-primary/10 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="grid size-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform group-hover:scale-105">
          <PlayIcon className="size-7 translate-x-0.5" weight="fill" />
        </span>
        <span className="font-medium text-foreground">Regarder la vidéo</span>
      </button>
    )
  }
  return (
    <div className={cn("bg-black", device === "mobile" && "flex justify-center")}>
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1&autoplay=1`}
        title={tutorial.title}
        loading="lazy"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        className={cn(
          "block border-0",
          device === "mobile" ? "aspect-[9/19.5] h-auto max-h-[75svh] w-auto max-w-full" : "aspect-video w-full",
        )}
      />
    </div>
  )
}

function TutorialCard({ tutorial, links }: { tutorial: Tutorial; links: TutorialLink }) {
  const ready = Boolean(links.desktop || links.mobile)
  return (
    <article className="frame flex flex-col overflow-hidden bg-card/70">
      <TutorialPlayer key={`${links.desktop}-${links.mobile}`} tutorial={tutorial} links={links} />
      <div className="flex items-start gap-3 border-t px-4 py-3">
        <span className="font-heading text-2xl text-primary tabular-nums leading-none">{tutorial.id}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="text-lg leading-snug">{tutorial.title}</h3>
          <p className="text-muted-foreground text-sm">{formatTutorialLength(tutorial.minutes)}</p>
        </div>
        {!ready && (
          <Badge variant="outline" className="shrink-0">
            Bientôt
          </Badge>
        )}
      </div>
    </article>
  )
}

const toDrafts = (links: TutorialLinks): Drafts =>
  Object.fromEntries(
    TUTORIALS.map((t) => [
      t.id,
      {
        desktop: links[t.id].desktop ? `https://youtu.be/${links[t.id].desktop}` : "",
        mobile: links[t.id].mobile ? `https://youtu.be/${links[t.id].mobile}` : "",
      },
    ]),
  )

function LinksEditor({
  links,
  open,
  onOpenChange,
}: {
  links: TutorialLinks
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<Drafts>(() => toDrafts(links))
  const [errors, setErrors] = useState<Record<string, true>>({})
  const save = useMutation(
    orpc.admin.help.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.admin.help.key() })
        onOpenChange(false)
      },
      onError: (error) => showError(errorMessage(error)),
    }),
  )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found: Record<string, true> = {}
    const value = Object.fromEntries(
      TUTORIALS.map((t) => {
        const entry = Object.fromEntries(
          DEVICES.map(({ key }) => {
            const text = drafts[t.id]![key].trim()
            const id = text ? youtubeId(text) : null
            if (text && !id) found[`video-${t.id}-${key}`] = true
            return [key, id]
          }),
        )
        return [t.id, entry]
      }),
    )
    setErrors(found)
    const parsed = tutorialLinksSchema.safeParse(value)
    if (Object.keys(found).length || !parsed.success) return
    save.mutate(parsed.data)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="data-[side=right]:sm:max-w-lg">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader className="border-b pr-14">
            <SheetTitle className="text-xl">Liens des vidéos</SheetTitle>
            <SheetDescription>
              Collez le lien YouTube de chaque vidéo. Laissez vide si elle n'est pas encore prête.
            </SheetDescription>
          </SheetHeader>
          <FieldGroup className="min-h-0 flex-1 gap-6 overflow-y-auto p-4">
            {TUTORIALS.map((t) => (
              <FieldSet key={t.id} className="gap-3">
                <FieldLegend className="font-medium">
                  <span className="text-primary tabular-nums">{t.id}</span> · {t.title}
                </FieldLegend>
                {DEVICES.map(({ key, label }) => {
                  const name = `video-${t.id}-${key}`
                  return (
                    <Field key={key} data-invalid={errors[name] || undefined}>
                      <FieldLabel htmlFor={name}>{label}</FieldLabel>
                      <Input
                        id={name}
                        inputMode="url"
                        autoComplete="off"
                        placeholder="https://youtu.be/…"
                        className="h-11"
                        aria-invalid={errors[name] || undefined}
                        value={drafts[t.id]![key]}
                        onChange={(event) => {
                          const text = event.target.value
                          setDrafts((d) => ({ ...d, [t.id]: { ...d[t.id]!, [key]: text } }))
                          if (errors[name]) setErrors(({ [name]: _, ...rest }) => rest)
                        }}
                      />
                      {errors[name] && <FieldError>Lien YouTube non reconnu</FieldError>}
                    </Field>
                  )
                })}
              </FieldSet>
            ))}
          </FieldGroup>
          <SheetFooter className="flex-row justify-end border-t pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <Button type="button" variant="ghost" className="h-11" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" className="h-11 min-w-36" disabled={save.isPending}>
              {save.isPending && <Spinner />}
              Enregistrer
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

export function HelpView({ initial }: { initial: TutorialLinks }) {
  const links = useQuery(orpc.admin.help.get.queryOptions({ initialData: initial }))
  const [editing, setEditing] = useState(false)
  const data = links.data ?? initial
  const ready = TUTORIALS.filter((t) => data[t.id].desktop || data[t.id].mobile).length
  return (
    <>
      <PageHeader
        title="Aide"
        description="Les vidéos pour prendre la boutique en main."
        actions={
          <Button variant="outline" className="h-11" onClick={() => setEditing(true)}>
            <PencilSimpleIcon />
            Modifier les liens
          </Button>
        }
      />
      <PageBody>
        <p className="text-muted-foreground">
          {ready === 0
            ? "Les vidéos arrivent bientôt. Chaque carte montrera la sienne dès qu'elle sera en ligne."
            : `${ready} vidéo${ready > 1 ? "s" : ""} sur ${TUTORIALS.length} disponible${ready > 1 ? "s" : ""}. Appuyez sur une vidéo pour la lancer.`}
        </p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {TUTORIALS.map((t) => (
            <TutorialCard key={t.id} tutorial={t} links={data[t.id]} />
          ))}
        </div>
      </PageBody>
      {editing && <LinksEditor links={data} open={editing} onOpenChange={setEditing} />}
    </>
  )
}
