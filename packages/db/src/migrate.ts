import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"
import type { Db } from "./index"

const MIGRATIONS = new URL("../drizzle", import.meta.url).pathname
const MIGRATE_LOCK = 327_001
const SEED_LOCK = 327_002

/**
 * Runs `fn` while a dedicated connection holds a Postgres advisory lock, so concurrent callers (several test packages
 * sharing one database under turbo) take turns instead of racing on `CREATE TYPE` or check-then-insert seeds.
 * The lock lives outside the caller's pool, so a pool of one connection still has a free connection for `fn`.
 */
async function withLock<T>(db: Db, key: number, fn: () => Promise<T>): Promise<T> {
  const lock = postgres(db.url, { max: 1, onnotice: () => {} })
  try {
    await lock`select pg_advisory_lock(${key})`
    try {
      return await fn()
    } finally {
      await lock`select pg_advisory_unlock(${key})`
    }
  } finally {
    await lock.end()
  }
}

export function withSeedLock<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  return withLock(db, SEED_LOCK, fn)
}

export function runMigrations(db: Db, folder = process.env.MIGRATIONS_DIR ?? MIGRATIONS): Promise<void> {
  return withLock(db, MIGRATE_LOCK, () => migrate(db, { migrationsFolder: folder }))
}
