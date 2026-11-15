import { randomUUID } from "node:crypto"
import { type Db, rateLimits } from "@workspace/db"
import { like } from "drizzle-orm"

const RUN = `tst-${randomUUID().slice(0, 8)}`
let visitors = 0

/** Headers of a visitor with an address of its own, so per-address limits never leak between tests or runs. */
export function visitorHeaders(extra: Record<string, string> = {}): Headers {
  return new Headers({ "x-forwarded-for": `${RUN}-${visitors++}`, ...extra })
}

/** Drops the limit rows this process created through `visitorHeaders`. */
export async function clearVisitorLimits(db: Db): Promise<void> {
  await db.delete(rateLimits).where(like(rateLimits.key, `%:${RUN}-%`))
}
