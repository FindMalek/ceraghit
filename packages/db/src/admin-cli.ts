import { createDb } from "./index"
import { seed } from "./seed/index"

/** Creates the owner login without touching any catalogue data. Used by the deploy. An existing login keeps the password
 * the owner chose; set ADMIN_PASSWORD_ROTATE=1 to make ADMIN_PASSWORD win again (see docs/deploy.md). */
const rotates = (value: string | undefined) => value === "1" || value === "true"
const db = createDb(process.env.DATABASE_URL!)
const { admin } = await seed(db, {
  admin: {
    email: process.env.ADMIN_EMAIL ?? "",
    password: process.env.ADMIN_PASSWORD ?? "",
    rotatePassword: rotates(process.env.ADMIN_PASSWORD_ROTATE),
  },
})
await db.close()
if (!admin) throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required")
console.info("owner login ready")
