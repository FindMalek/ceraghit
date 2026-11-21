import { basename } from "node:path"
import postgres from "postgres"

const CREATE_LOCK = 327_003

/** `postgres://u:p@h/ceraghit_test` plus `orpc` gives `postgres://u:p@h/ceraghit_test_orpc`. */
export function databaseUrlFor(url: string, name: string): string {
  const target = new URL(url)
  target.pathname = `/${`${target.pathname.slice(1)}_${name}`.replace(/[^a-z0-9_]/gi, "_").slice(0, 63)}`
  return target.toString()
}

/**
 * Creates the database named in `url` when it is missing. `CREATE DATABASE` copies `template1` and fails when two
 * sessions do it at once, so callers take turns on an advisory lock held on the maintenance database.
 */
export async function ensureDatabase(url: string): Promise<void> {
  const name = new URL(url).pathname.slice(1)
  const maintenance = new URL(url)
  maintenance.pathname = "/postgres"
  const sql = postgres(maintenance.toString(), { max: 1, onnotice: () => {} })
  try {
    await sql`select pg_advisory_lock(${CREATE_LOCK})`
    try {
      const rows = await sql`select 1 from pg_database where datname = ${name}`
      if (rows.length === 0) await sql.unsafe(`create database "${name}"`)
    } finally {
      await sql`select pg_advisory_unlock(${CREATE_LOCK})`
    }
  } finally {
    await sql.end()
  }
}

/**
 * Bun test preload. Turbo runs every package's `test` at once against one `DATABASE_URL`, and tests write global
 * tables (`integration_credentials`, `settings`, `categories`), so each package gets its own database instead.
 */
export async function isolateDatabasePerPackage(): Promise<void> {
  const base = process.env.DATABASE_URL
  if (!base) return
  const url = databaseUrlFor(base, basename(process.cwd()))
  await ensureDatabase(url)
  process.env.DATABASE_URL = url
}
