import { mediaSortSchema } from "@workspace/sdk"

export type MediaFilter = "all" | "unused"
export type MediaSort = (typeof mediaSortSchema.options)[number]

export interface MediaQuery {
  q: string
  sort: MediaSort
  filter: MediaFilter
  tag: string
}

export const DEFAULT_MEDIA_QUERY: MediaQuery = { q: "", sort: "newest", filter: "all", tag: "" }

const FILTERS: MediaFilter[] = ["all", "unused"]

/** Reads `?q=&sort=&filter=&tag=` (and the `?unused=1` link shape), dropping anything unknown. */
export function parseMediaQuery(params: URLSearchParams): MediaQuery {
  const sort = mediaSortSchema.safeParse(params.get("sort"))
  const filter = params.get("filter") as MediaFilter | null
  return {
    q: (params.get("q") ?? "").trim().slice(0, 80),
    sort: sort.success ? sort.data : "newest",
    filter: filter && FILTERS.includes(filter) ? filter : params.get("unused") === "1" ? "unused" : "all",
    tag: (params.get("tag") ?? "").trim().slice(0, 30),
  }
}

/** Only non-default values, so the url stays clean. */
export function toSearchParams(query: MediaQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.q) params.set("q", query.q)
  if (query.sort !== "newest") params.set("sort", query.sort)
  if (query.filter !== "all") params.set("filter", query.filter)
  if (query.tag) params.set("tag", query.tag)
  return params
}

export function toListInput(query: MediaQuery) {
  return {
    ...(query.q && { q: query.q }),
    sort: query.sort,
    ...(query.filter !== "all" && { unused: true }),
    ...(query.tag && { tag: query.tag }),
  }
}

export const formatBytes = (bytes: number): string =>
  bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(bytes / 1e3))} Ko`

export const formatDay = (iso: string): string =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })

/** Tags typed with Enter or comma: trimmed, lowercased, unique, max 12 of 30 characters. */
export function addTag(tags: string[], raw: string): string[] {
  const tag = raw.trim().toLowerCase().slice(0, 30)
  return !tag || tags.includes(tag) || tags.length >= 12 ? tags : [...tags, tag]
}
