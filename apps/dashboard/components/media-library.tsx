"use client"

import { ORPCError } from "@orpc/client"
import { MagnifyingGlassIcon } from "@phosphor-icons/react"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import type { Media } from "@workspace/sdk"
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@workspace/ui/components/input-group"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@workspace/ui/components/toggle-group"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { MediaDetail } from "@/components/media-detail"
import { MediaGrid } from "@/components/media-grid"
import { MediaUploadZone } from "@/components/media-upload-zone"
import { PageBody, PageHeader } from "@/components/page-header"
import { EmptyState, ErrorState } from "@/components/query-state"
import { SimpleSelect } from "@/components/simple-select"
import { StorageUsage } from "@/components/storage-usage"
import {
  applyFilter,
  DEFAULT_MEDIA_QUERY,
  formatDay,
  isExpiringSoon,
  type MediaFilter,
  type MediaQuery,
  type MediaSort,
  parseMediaQuery,
  toListInput,
  toSearchParams,
} from "@/lib/media-query"

const SORTS: { value: MediaSort; label: string }[] = [
  { value: "newest", label: "Plus récentes" },
  { value: "oldest", label: "Plus anciennes" },
  { value: "name", label: "Nom (A à Z)" },
  { value: "size", label: "Taille" },
  { value: "usage", label: "Les plus utilisées" },
]
const FILTERS: { value: MediaFilter; label: string }[] = [
  { value: "all", label: "Toutes" },
  { value: "unused", label: "Non utilisées" },
  { value: "expiring", label: "Bientôt supprimées" },
]

/** Search, sort, filters, tag chips and the grid with "Charger plus": shared by the page and the picker. */
export function MediaBrowser({
  query,
  onQueryChange,
  selectedIds,
  selectable,
  onActivate,
  onToggle,
  onChoose,
  onItems,
  upload,
}: {
  query: MediaQuery
  onQueryChange: (query: MediaQuery) => void
  selectedIds: string[]
  selectable: boolean
  onActivate: (media: Media) => void
  onToggle: (media: Media) => void
  onChoose?: (media: Media) => void
  onItems?: (items: Media[]) => void
  upload?: React.ReactNode
}) {
  const [text, setText] = useState(query.q)
  useEffect(() => setText(query.q), [query.q])
  useEffect(() => {
    if (text === query.q) return
    const timer = setTimeout(() => onQueryChange({ ...query, q: text.trim() }), 250)
    return () => clearTimeout(timer)
  }, [text, query, onQueryChange])

  const tags = useQuery(orpc.admin.media.tags.queryOptions())
  const list = useInfiniteQuery(
    orpc.admin.media.list.infiniteOptions({
      input: (offset: number) => ({ ...toListInput(query), offset }),
      initialPageParam: 0,
      getNextPageParam: (page) => page.nextOffset ?? undefined,
    }),
  )
  const pages = list.data?.pages
  const items = useMemo(
    () => applyFilter(pages?.flatMap((page) => page.items) ?? [], query.filter),
    [pages, query.filter],
  )
  useEffect(() => onItems?.(items), [items, onItems])

  const noStorage = list.error instanceof ORPCError && list.error.code === "PRECONDITION_FAILED"
  const filtered = query.q || query.tag || query.filter !== "all"
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <InputGroup className="h-11 sm:max-w-md">
          <InputGroupAddon>
            <MagnifyingGlassIcon />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label="Rechercher une photo"
            placeholder="Rechercher par nom, mot-clé ou description"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </InputGroup>
        <SimpleSelect
          label="Trier par"
          value={query.sort}
          options={SORTS}
          className="h-11 sm:w-52"
          onChange={(sort) => onQueryChange({ ...query, sort })}
        />
      </div>
      <ToggleGroup
        aria-label="Filtrer les photos"
        value={[query.filter]}
        onValueChange={(next) => next[0] && onQueryChange({ ...query, filter: next[0] as MediaFilter })}
        className="flex-wrap justify-start"
      >
        {FILTERS.map((f) => (
          <ToggleGroupItem key={f.value} value={f.value} className="min-h-11 px-4">
            {f.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {tags.data && tags.data.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Mots-clés">
          {tags.data.map(({ tag, count }) => (
            <li key={tag}>
              <Button
                size="sm"
                className="min-h-11"
                variant={query.tag === tag ? "default" : "outline"}
                aria-pressed={query.tag === tag}
                onClick={() => onQueryChange({ ...query, tag: query.tag === tag ? "" : tag })}
              >
                {tag} ({count})
              </Button>
            </li>
          ))}
        </ul>
      )}
      {upload}
      {noStorage ? (
        <EmptyState title="Le stockage des photos n'est pas configuré ici." />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-busy>
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={`s-${i}`} className="aspect-square w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        filtered ? (
          <EmptyState
            title={query.q ? `Aucune photo ne correspond à « ${query.q} ».` : "Aucune photo ne correspond."}
            action={
              <Button variant="outline" className="h-11" onClick={() => onQueryChange(DEFAULT_MEDIA_QUERY)}>
                {query.q ? "Effacer la recherche" : "Effacer les filtres"}
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="Aucune photo pour le moment"
            description="Ajoutez vos premières photos pour les réutiliser partout."
          />
        )
      ) : (
        <>
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {selectable && selectedIds.length > 0
              ? `${selectedIds.length} sélectionnée${selectedIds.length > 1 ? "s" : ""}`
              : `${list.data?.pages[0]?.total ?? items.length} photo${(list.data?.pages[0]?.total ?? 0) > 1 ? "s" : ""}`}
          </p>
          <MediaGrid
            items={items}
            selectedIds={selectedIds}
            selectable={selectable}
            onActivate={onActivate}
            onToggle={onToggle}
            onChoose={onChoose}
          />
          {list.hasNextPage && (
            <Button
              variant="outline"
              className="h-11 self-center"
              disabled={list.isFetchingNextPage}
              onClick={() => list.fetchNextPage()}
            >
              Charger plus
            </Button>
          )}
        </>
      )}
    </div>
  )
}

/** The `/media` page: expiring banner, storage meter, upload zone and the library. */
export function MediaLibrary() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const query = parseMediaQuery(new URLSearchParams(params.toString()))
  const [openId, setOpenId] = useState<string | null>(null)
  const setQuery = (next: MediaQuery) => {
    const search = toSearchParams(next).toString()
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false })
  }
  const unused = useQuery(orpc.admin.media.list.queryOptions({ input: { unused: true, limit: 60, sort: "oldest" } }))
  const expiring = (unused.data?.items ?? []).filter((m) => isExpiringSoon(m))
  const first = expiring
    .map((m) => m.deletesAt)
    .filter(Boolean)
    .sort()[0]
  return (
    <>
      <PageHeader title="Médiathèque" description="Toutes vos photos au même endroit." actions={null} />
      <PageBody>
        <StorageUsage />
        {expiring.length > 0 && first && (
          <Alert>
            <AlertTitle>
              {expiring.length} photo{expiring.length > 1 ? "s" : ""} inutilisée{expiring.length > 1 ? "s" : ""} seront
              supprimées d'ici le {formatDay(first)}.
            </AlertTitle>
            <AlertDescription>
              <Button variant="outline" className="h-11" onClick={() => setQuery({ ...query, filter: "expiring" })}>
                Voir
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <MediaBrowser
          query={query}
          onQueryChange={setQuery}
          selectedIds={[]}
          selectable={false}
          onActivate={(media) => setOpenId(media.id)}
          onToggle={(media) => setOpenId(media.id)}
          upload={<MediaUploadZone />}
        />
      </PageBody>
      <MediaDetail id={openId} onClose={() => setOpenId(null)} />
    </>
  )
}
