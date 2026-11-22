import { expect, test } from "bun:test"
import { isolateDatabasePerPackage } from "../src/test-database"

test("the test preload refuses to create databases in production or preview", async () => {
  for (const APP_ENV of ["production", "preview"]) {
    await expect(isolateDatabasePerPackage({ APP_ENV, DATABASE_URL: "postgres://u:p@db.invalid/app" })).rejects.toThrow(
      `APP_ENV=${APP_ENV}`,
    )
  }
})
