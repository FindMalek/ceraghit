import { createDb } from "./index"
import { seed } from "./seed/index"

/** Creates the owner login, or resets its password, without touching any catalogue data. Used by the deploy. */
const db = createDb(process.env.DATABASE_URL!)
const { admin } = await seed(db, {
  admin: { email: process.env.ADMIN_EMAIL ?? "", password: process.env.ADMIN_PASSWORD ?? "" },
})
await db.close()
if (!admin) throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required")
console.info("owner login ready")
