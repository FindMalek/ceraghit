import { categories, locations, media, productImages } from "@workspace/db"
import { type AnyColumn, sql } from "drizzle-orm"
import type { PgTable } from "drizzle-orm/pg-core"

export interface MediaReference {
  table: PgTable
  column: AnyColumn
  kind: "product" | "category" | "location"
}

/** Every foreign key to `media.id`. Usage counts, the delete guard and cleanup all read this list. */
export const MEDIA_REFERENCES: readonly MediaReference[] = [
  { table: productImages, column: productImages.mediaId, kind: "product" },
  { table: categories, column: categories.imageMediaId, kind: "category" },
  { table: locations, column: locations.imageMediaId, kind: "location" },
]

/** `(select count(*) ...) + ...` of the pictures' references, for a query on `media`. */
export function usageCountSql() {
  const counts = MEDIA_REFERENCES.map((r) => sql`(select count(*) from ${r.table} where ${r.column} = ${media.id})`)
  return sql<number>`(${sql.join(counts, sql` + `)})::int`
}
