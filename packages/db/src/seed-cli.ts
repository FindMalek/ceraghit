import { createDb } from "./index"
import { seed } from "./seed/index"

/**
 * `pnpm db:seed` seeds the demo (catalogue, fake orders, descriptions, locations and a complete shop profile);
 * `--onboarding` leaves the profile empty so the dashboard onboarding starts; `--catalog` only the real catalogue.
 */
const catalogOnly = process.argv.includes("--catalog")
const db = createDb(process.env.DATABASE_URL!)
const result = await seed(db, {
  catalog: catalogOnly,
  demo: !catalogOnly,
  profile: process.argv.includes("--onboarding") ? "empty" : "complete",
  admin: {
    email: process.env.ADMIN_EMAIL ?? "",
    password: process.env.ADMIN_PASSWORD ?? "",
    rotatePassword: ["1", "true"].includes(process.env.ADMIN_PASSWORD_ROTATE ?? ""),
  },
})
await db.close()
console.info("seeded", result)
