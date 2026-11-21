import { type Db, settings } from "@workspace/db"
import { eq } from "drizzle-orm"
import type { Services } from "../../context"
import { resolveShipping } from "./resolve"
import { getShippingSettings } from "./settings"
import type { ShipAddress } from "./types"

const TTL_MS = 7 * 24 * 3600_000
const REFRESH_TIMEOUT_MS = 4000
export const MAX_RESULTS = 50

interface CitiesRow {
  cities: string[]
  fetchedAt: string
  /** The demo seed list: served in manual mode too, so previews show the picker without Aramex. */
  fixture?: boolean
}

export interface Cities {
  cities: string[]
  source: "aramex" | "cache" | "none"
  fetchedAt: string | null
}

const keyFor = (country: string) => `aramex:cities:${country}`

/** Lowercase without accents, so "sousse", "Sousse" and "SOUSSE" match. */
export const normaliseCity = (text: string) => text.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")

async function readRow(db: Db, country: string): Promise<CitiesRow | null> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, keyFor(country)))
    .limit(1)
  const value = row?.value as Partial<CitiesRow> | undefined
  return Array.isArray(value?.cities) && typeof value?.fetchedAt === "string" ? (value as CitiesRow) : null
}

async function writeRow(db: Db, country: string, value: CitiesRow): Promise<void> {
  const key = keyFor(country)
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
}

const withTimeout = <T>(work: Promise<T>, ms: number): Promise<T> =>
  Promise.race([work, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))])

async function fetchFromAramex(services: Services, country: string): Promise<string[] | null> {
  try {
    const { provider, degraded } = await resolveShipping(services)
    if (degraded || provider.id !== "aramex") return null
    const list = await withTimeout(provider.fetchCities(country), REFRESH_TIMEOUT_MS)
    return [...new Set(list.map((c) => c.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  } catch {
    return null
  }
}

/**
 * The cities Aramex knows for a country, cached 7 days in `settings`. Refreshed lazily with a 4 second limit; when that
 * fails the stale list is served, or none (the caller then never blocks a customer). Manual mode never calls Aramex.
 */
export async function getCities(services: Services, country: string, opts: { force?: boolean } = {}): Promise<Cities> {
  const row = await readRow(services.db, country)
  const mode = await getShippingSettings(services.db).catch(() => null)
  if (mode?.provider !== "aramex") {
    return row?.fixture ? { cities: row.cities, source: "cache", fetchedAt: row.fetchedAt } : none()
  }
  const fresh = row && !opts.force && services.now().getTime() - Date.parse(row.fetchedAt) < TTL_MS
  if (row && fresh) return { cities: row.cities, source: "cache", fetchedAt: row.fetchedAt }
  const list = await fetchFromAramex(services, country)
  if (list && list.length > 0) {
    const fetchedAt = services.now().toISOString()
    await writeRow(services.db, country, { cities: list, fetchedAt })
    return { cities: list, source: "aramex", fetchedAt }
  }
  return row ? { cities: row.cities, source: "cache", fetchedAt: row.fetchedAt } : none()
}

const none = (): Cities => ({ cities: [], source: "none", fetchedAt: null })

/** Substring match, accent and case insensitive, prefix matches first, capped. */
export function searchCities(cities: string[], query: string): string[] {
  const q = normaliseCity(query)
  if (!q) return cities.slice(0, MAX_RESULTS)
  const hits = cities.filter((c) => normaliseCity(c).includes(q))
  hits.sort((a, b) => Number(!normaliseCity(a).startsWith(q)) - Number(!normaliseCity(b).startsWith(q)))
  return hits.slice(0, MAX_RESULTS)
}

/** The list's own spelling of a city typed in any case or with or without accents, or null. */
export function canonicalCity(cities: string[], typed: string): string | null {
  const wanted = normaliseCity(typed)
  return cities.find((c) => normaliseCity(c) === wanted) ?? null
}

export async function checkAddress(
  services: Services,
  address: ShipAddress,
): Promise<{ ok: boolean; suggestions: ShipAddress[]; message: string }> {
  try {
    const { provider, degraded } = await resolveShipping(services)
    if (degraded || provider.id !== "aramex") {
      return { ok: false, suggestions: [], message: "Aramex n'est pas configuré." }
    }
    const { suggestions } = await provider.validateAddress(address)
    const same = suggestions.some((s) => normaliseCity(s.city) === normaliseCity(address.city))
    if (suggestions.length === 0 || same) return { ok: true, suggestions: [], message: "Adresse reconnue." }
    return { ok: false, suggestions, message: "Aramex propose une autre adresse." }
  } catch {
    return { ok: false, suggestions: [], message: "Aramex ne répond pas. Réessayez dans un instant." }
  }
}
