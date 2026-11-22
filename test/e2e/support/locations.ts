import postgres from "postgres"
import { E2E } from "../env"

const sql = postgres(E2E.databaseUrl, { max: 2, idle_timeout: 5 })

export interface LocationRow {
  id: string
  name: string
  city: string
  phone: string | null
  visible: boolean
  hours: Record<string, string> | null
}

export async function locationRows(namePrefix: string): Promise<LocationRow[]> {
  return sql<LocationRow[]>`
    select id, name, city, phone, visible, hours from locations where name like ${`${namePrefix}%`} order by name`
}

/** Leftovers of a failed run, so a rerun starts clean and /atelier never shows them to another spec. */
export async function deleteLocations(namePrefix: string): Promise<void> {
  await sql`delete from locations where name like ${`${namePrefix}%`}`
}
