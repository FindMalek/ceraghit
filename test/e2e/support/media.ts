import postgres from "postgres"
import { E2E } from "../env"

const sql = postgres(E2E.databaseUrl, { max: 2, idle_timeout: 5 })

export interface MediaRow {
  id: string
  key: string
  mime: string
  width: number
  height: number
  bytes: number
  hash: string
  confirmed: boolean
  keep: boolean
}

export async function mediaRows(like: string): Promise<MediaRow[]> {
  return sql<MediaRow[]>`
    select id, key, mime, width, height, bytes, hash, confirmed_at is not null as confirmed, keep
    from media where filename like ${like} order by created_at`
}

export async function mediaById(id: string): Promise<MediaRow | null> {
  const [row] = await sql<MediaRow[]>`
    select id, key, mime, width, height, bytes, hash, confirmed_at is not null as confirmed, keep
    from media where id = ${id}`
  return row ?? null
}

/** Pretends nothing has shown this image for `days` days, so the unused tier of the cleanup cron is due. */
export async function markMediaUnused(id: string, days: number): Promise<void> {
  await sql`update media set unused_since = now() - make_interval(days => ${days}) where id = ${id}`
}

export async function pinMedia(id: string): Promise<void> {
  await sql`update media set keep = true where id = ${id}`
}
