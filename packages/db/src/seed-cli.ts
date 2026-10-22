import { createDb } from "./index"
import { seed } from "./seed/index"

/** `pnpm db:seed` seeds the demo (catalogue + fake orders); `pnpm db:seed -- --catalog` only the real catalogue. */
const catalogOnly = process.argv.includes("--catalog")
const db = createDb(process.env.DATABASE_URL!)
const result = await seed(db, {
  catalog: catalogOnly,
  demo: !catalogOnly,
  admin: { email: process.env.ADMIN_EMAIL ?? "", password: process.env.ADMIN_PASSWORD ?? "" },
})
await db.close()
console.info("seeded", result)
