import { sql } from "drizzle-orm"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import type { Db } from "./index"

const MIGRATIONS = new URL("../drizzle", import.meta.url).pathname
const MIGRATE_LOCK = 327_001
const SEED_LOCK = 327_002

/**
 * Runs `fn` while holding a Postgres advisory lock, so concurrent callers (several test packages sharing one
 * database under turbo) take turns instead of racing on `CREATE TYPE` or check-then-insert seeds.
 */
async function withLock<T>(db: Db, key: number, fn: () => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${key})`)
    return fn()
  })
}

export function withSeedLock<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  return withLock(db, SEED_LOCK, fn)
}

export function runMigrations(db: Db, folder = process.env.MIGRATIONS_DIR ?? MIGRATIONS): Promise<void> {
  return withLock(db, MIGRATE_LOCK, () => migrate(db, { migrationsFolder: folder }))
}
