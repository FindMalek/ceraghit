"use client"

import { HourglassMediumIcon, MagnifyingGlassIcon, PencilSimpleIcon, PlayIcon } from "@phosphor-icons/react"
import { useQuery } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import {
  formatTutorialLength,
  playableSources,
  searchTutorials,
  TUTORIAL_AREA_LABELS,
  TUTORIAL_AREAS,
  TUTORIAL_AUDIENCE_LABELS,
  TUTORIAL_AUDIENCES,
  TUTORIALS,
  type Tutorial,
  type TutorialFiles,
  type TutorialLink,
  type TutorialLinks,
  type TutorialManifest,
  tutorialKeys,
  tutorialTags,
} from "@workspace/sdk"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@workspace/ui/components/input-group"
import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { PageBody, PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/query-state"
import { SimpleSelect } from "@/components/simple-select"
import { TutorialLinksEditor } from "@/components/tutorial-links-editor"
import { fileUrl, TutorialPlayerDialog } from "@/components/tutorial-player"
import { parseTutorialQuery, type TutorialQuery, toTutorialSearchParams } from "@/lib/tutorial-query"

const AUDIENCE_OPTIONS = [
  { value: "all" as const, label: "Tous les publics" },
  ...TUTORIAL_AUDIENCES.map((value) => ({ value, label: TUTORIAL_AUDIENCE_LABELS[value] })),
]

const TAG_OPTIONS = [
  { value: "all" as string, label: "Tous les mots-clés" },
  ...tutorialTags(TUTORIALS).map((value) => ({ value, label: value })),
]

function Poster({ src }: { src: string | null }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className="relative aspect-video w-full overflow-hidden bg-primary/10">
      {src && !broken && (
        // biome-ignore lint/performance/noImgElement: a hosted file behind the proxy, no optimisation needed
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </div>
  )
}

function TutorialCard({
  tutorial,
  playable,
  posterUrl,
  onOpen,
}: {
  tutorial: Tutorial
  playable: boolean
  posterUrl: string | null
  onOpen: () => void
}) {
  return (
    <li className="flex">
      <button
        type="button"
        onClick={onOpen}
        aria-label={playable ? `Regarder : ${tutorial.title}` : `${tutorial.title} (bientôt disponible)`}
        className="frame group flex w-full flex-col overflow-hidden bg-card/70 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative">
          <Poster src={posterUrl} />
          <span className="absolute inset-0 grid place-items-center">
            {playable ? (
              <span className="grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform group-hover:scale-105">
                <PlayIcon className="size-6 translate-x-0.5" weight="fill" />
              </span>
            ) : (
              <span className="grid size-12 place-items-center rounded-full bg-background/80 text-muted-foreground">
                <HourglassMediumIcon className="size-6" />
              </span>
            )}
          </span>
          <Badge variant="secondary" className="absolute right-2 bottom-2">
            {formatTutorialLength(tutorial.lengthSeconds)}
          </Badge>
        </div>
        <div className="flex flex-1 flex-col gap-2 border-t px-4 py-3">
          <div className="flex items-start gap-3">
            <span className="font-heading text-primary text-xl tabular-nums leading-none">
              {tutorial.id.slice(0, 2)}
            </span>
            <h3 className="min-w-0 flex-1 text-lg leading-snug">{tutorial.title}</h3>
            {!playable && (
              <Badge variant="outline" className="shrink-0">
                Bientôt
              </Badge>
            )}
          </div>
          <p className="line-clamp-2 text-muted-foreground text-sm">{tutorial.description}</p>
          <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
            {tutorial.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      </button>
    </li>
  )
}

export function HelpView({
  initial,
  library,
}: {
  initial: TutorialLinks
  library: { manifest: TutorialManifest; prefix: string }
}) {
  const links = useQuery(orpc.admin.help.get.queryOptions({ initialData: initial }))
  const data: TutorialLinks = links.data ?? initial
  const { manifest, prefix } = library
  const [editing, setEditing] = useState(false)

  const pathname = usePathname()
  const params = useSearchParams()
  const query = useMemo(() => parseTutorialQuery(new URLSearchParams(params.toString())), [params])
  const latest = useRef(query)
  latest.current = query
  const [text, setText] = useState(query.q)

  /** The url is the state: shareable, and the back button keeps working. */
  const update = (patch: Partial<TutorialQuery>, mode: "replace" | "push" = "replace") => {
    const search = toTutorialSearchParams({ ...latest.current, ...patch }).toString()
    const url = search ? `${pathname}?${search}` : pathname
    if (mode === "push") window.history.pushState(null, "", url)
    else window.history.replaceState(null, "", url)
  }

  // Back/forward changes the url without touching the input: follow it (typing keeps its own spaces).
  // biome-ignore lint/correctness/useExhaustiveDependencies: only an url change should rewrite the input
  useEffect(() => {
    setText((current) => (current.trim() === query.q ? current : query.q))
  }, [query.q])

  // biome-ignore lint/correctness/useExhaustiveDependencies: only typing should schedule an url update
  useEffect(() => {
    if (text.trim() === latest.current.q) return
    const timer = setTimeout(() => update({ q: text }), 300)
    return () => clearTimeout(timer)
  }, [text])

  const results = useMemo(
    () => searchTutorials(TUTORIALS, { query: query.q, area: query.area, audience: query.audience, tag: query.tag }),
    [query.q, query.area, query.audience, query.tag],
  )

  const isPlayable = (t: Tutorial) => {
    const files: TutorialFiles | undefined = manifest.videos[t.id]
    const link: TutorialLink | undefined = data[t.id]
    return Object.keys(playableSources(t, files, link)).length > 0
  }
  const ready = TUTORIALS.filter(isPlayable).length
  const open = TUTORIALS.find((t) => t.id === query.video) ?? null
  const filtered = query.q !== "" || query.area !== null || query.audience !== null || query.tag !== null || text !== ""
  const reset = () => {
    setText("")
    update({ q: "", area: null, audience: null, tag: null })
  }

  return (
    <>
      <PageHeader
        title="Aide"
        description="Les vidéos pour prendre la boutique en main."
        actions={
          <Button variant="outline" className="h-11" onClick={() => setEditing(true)}>
            <PencilSimpleIcon />
            Liens YouTube
          </Button>
        }
      />
      <PageBody>
        <div className="flex flex-col gap-3">
          <InputGroup className="h-11 md:max-w-md">
            <InputGroupAddon>
              <MagnifyingGlassIcon />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label="Rechercher une vidéo"
              placeholder="Rechercher : panier, facture, livraison…"
              autoComplete="off"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </InputGroup>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div role="group" aria-label="Filtrer par domaine" className="flex flex-wrap gap-2">
              {[null, ...TUTORIAL_AREAS].map((area) => (
                <Button
                  key={area ?? "all"}
                  type="button"
                  size="sm"
                  variant={query.area === area ? "default" : "outline"}
                  aria-pressed={query.area === area}
                  className="h-10"
                  onClick={() => update({ area })}
                >
                  {area ? TUTORIAL_AREA_LABELS[area] : "Tous"}
                </Button>
              ))}
            </div>
            <SimpleSelect
              label="Filtrer par public"
              value={query.audience ?? "all"}
              onChange={(value) => update({ audience: value === "all" ? null : value })}
              options={AUDIENCE_OPTIONS}
              className="h-11 w-full md:ml-auto md:w-52"
            />
            <SimpleSelect
              label="Filtrer par mot-clé"
              value={query.tag ?? "all"}
              onChange={(value) => update({ tag: value === "all" ? null : value })}
              options={TAG_OPTIONS}
              className="h-11 w-full md:w-52"
            />
            {filtered && (
              <Button type="button" variant="ghost" className="h-11" onClick={reset}>
                Réinitialiser les filtres
              </Button>
            )}
          </div>
        </div>

        <p className="min-h-6 text-muted-foreground" aria-live="polite">
          {results.length} vidéo{results.length > 1 ? "s" : ""}
          {filtered ? ` sur ${TUTORIALS.length}` : ""}
          {ready === 0
            ? " · les vidéos arrivent bientôt"
            : ` · ${ready} disponible${ready > 1 ? "s" : ""} pour l'instant`}
        </p>

        {results.length === 0 ? (
          <EmptyState
            title="Aucune vidéo"
            description="Aucune vidéo ne correspond à cette recherche."
            action={
              <Button type="button" variant="outline" onClick={reset}>
                Voir toutes les vidéos
              </Button>
            }
          />
        ) : (
          <ul aria-label="Vidéos" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {results.map((t) => (
              <TutorialCard
                key={t.id}
                tutorial={t}
                playable={isPlayable(t)}
                posterUrl={manifest.videos[t.id]?.poster ? fileUrl(prefix, tutorialKeys(t.id, "desktop").poster) : null}
                onOpen={() => update({ video: t.id }, "push")}
              />
            ))}
          </ul>
        )}
      </PageBody>

      <TutorialPlayerDialog
        tutorial={open}
        files={open ? manifest.videos[open.id] : undefined}
        link={open ? data[open.id] : undefined}
        prefix={prefix}
        onClose={() => update({ video: null })}
        onSelect={(video) => update({ video })}
      />
      {editing && <TutorialLinksEditor links={data} open={editing} onOpenChange={setEditing} />}
    </>
  )
}
