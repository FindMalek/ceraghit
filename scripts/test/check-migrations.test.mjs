import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { checkSql, olderMigrationPrs } from "../check-migrations.mjs"

const off = { allowDestructive: false }
const on = { allowDestructive: true }

test("a generated additive migration passes", () => {
  const sql = readFileSync(new URL("../../packages/db/drizzle/0004_handy_tombstone.sql", import.meta.url), "utf8")
  assert.deepEqual(checkSql(sql, "0004.sql", off), [])
})

test("DROP COLUMN fails on its line", () => {
  const sql = `CREATE INDEX "a_idx" ON "a" USING btree ("b");--> statement-breakpoint\nALTER TABLE "products" DROP COLUMN "material";`
  const [problem, ...rest] = checkSql(sql, "0005.sql", off)
  assert.equal(rest.length, 0)
  assert.equal(problem.line, 2)
  assert.match(problem.reason, /drops a column/)
})

test("ADD COLUMN NOT NULL without DEFAULT fails", () => {
  const sql = `ALTER TABLE "orders" ADD COLUMN "carrier" text NOT NULL;`
  assert.match(checkSql(sql, "0005.sql", off)[0].reason, /NOT NULL column without DEFAULT/)
})

test("ADD COLUMN NOT NULL with DEFAULT passes", () => {
  const sql = `ALTER TABLE "orders" ADD COLUMN "carrier" text DEFAULT 'none' NOT NULL;`
  assert.deepEqual(checkSql(sql, "0005.sql", off), [])
})

const marked = `CREATE TABLE "x" ("id" text);--> statement-breakpoint\n-- destructive-ok: old column unused since 0005\nALTER TABLE "products" DROP COLUMN "material";`

test("a destructive-ok marker without ALLOW_DESTRUCTIVE fails", () => {
  assert.match(checkSql(marked, "0006.sql", off)[0].reason, /migration:destructive/)
})

test("a destructive-ok marker with ALLOW_DESTRUCTIVE passes", () => {
  assert.deepEqual(checkSql(marked, "0006.sql", on), [])
})

test("only newer migration PRs wait, the oldest open one passes", () => {
  const prs = [
    { number: 123, files: ["packages/db/drizzle/0005_shop_profile.sql", "packages/db/drizzle/meta/_journal.json"] },
    { number: 140, files: ["apps/web/app/page.tsx"] },
    { number: 160, files: ["packages/db/drizzle/0005_media.sql"] },
  ]
  assert.deepEqual(olderMigrationPrs(prs, 123), [])
  assert.deepEqual(olderMigrationPrs(prs, 160), [123])
})
