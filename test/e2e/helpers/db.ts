import { adminSessions, admins, createDb, type Db, rateLimits, shopProfile } from "@workspace/db"
import { eq, like, sql } from "drizzle-orm"
import { E2E } from "../env"

export type { Db }
export { adminSessions, admins, rateLimits, shopProfile }

export function openDb(): Db {
  return createDb(E2E.databaseUrl, 2)
}

/** Back to a fresh install: no shop profile, owner name not confirmed. The owner's sessions stay so other specs keep their login. */
export async function resetSetup(db: Db): Promise<void> {
  await db.delete(shopProfile)
  await db
    .update(admins)
    .set({ name: "Sabri Ghit", nameConfirmedAt: null })
    .where(eq(admins.email, E2E.adminEmail.toLowerCase()))
}

/** Marks the shop as onboarded the way the demo seed does, so the rest of the dashboard opens. */
export async function completeSetup(db: Db): Promise<void> {
  await db
    .insert(shopProfile)
    .values({
      legalName: "Ceraghit Creation",
      displayName: "Ceraghit",
      address: "1 rue de l'Atelier",
      city: "Tunis",
      country: "TN",
      phones: ["+21620000000"],
      email: "shop@e2e.local",
      notifyEmail: "shop@e2e.local",
      taxId: "1234567/A/M/000",
      bankHolder: "Ceraghit Creation",
      bankName: "Banque e2e",
      bankRib: "10006035183598478831",
      shippingConfirmedAt: new Date(),
      onboardedAt: new Date(),
    })
    .onConflictDoNothing()
  await db.update(admins).set({ nameConfirmedAt: new Date() }).where(eq(admins.email, E2E.adminEmail.toLowerCase()))
}

/** Server fake time: the api reads window starts and expiries from the database, so moving them back ages them. */
export async function ageLimits(db: Db, ms: number, keyPrefix: string): Promise<void> {
  await db
    .update(rateLimits)
    .set({ windowStart: sql`${rateLimits.windowStart} - ${`${ms} milliseconds`}::interval` })
    .where(like(rateLimits.key, `${keyPrefix}%`))
}

export async function ageSession(db: Db, tokenHash: string, expiresAt: Date): Promise<void> {
  await db.update(adminSessions).set({ expiresAt }).where(eq(adminSessions.tokenHash, tokenHash))
}
