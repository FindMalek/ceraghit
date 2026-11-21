import postgres from "postgres"
import { E2E } from "../env"

const sql = postgres(E2E.databaseUrl, { max: 2, idle_timeout: 5 })

export interface CategoryRow {
  id: string
  name: Record<string, string>
  visible: boolean
  position: number
}

export async function categoryRows(frPrefix: string): Promise<CategoryRow[]> {
  return sql<CategoryRow[]>`
    select id, name, visible, position from categories where name->>'fr' like ${`${frPrefix}%`} order by position`
}

/** A category that still holds products: it cannot be deleted. */
export async function categoryWithProducts(): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    select c.id from categories c join products p on p.category_id = c.id group by c.id order by count(*) desc limit 1`
  if (!row) throw new Error("no category with products in the demo seed")
  return row.id
}
