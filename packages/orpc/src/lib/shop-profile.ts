import { type Db, settings, shopProfile } from "@workspace/db"
import { type PublicShopProfile, type ShopProfile, UNFILLED_BANK_TEXT } from "@workspace/sdk"
import { eq, sql } from "drizzle-orm"
import { DEFAULT_CONTACT, SETTINGS_KEY } from "./settings"

const ID = "shop"

export type ShopProfileRow = typeof shopProfile.$inferSelect

type LegacyStudio = { contactEmail?: unknown; phones?: unknown; bank?: Record<string, unknown> }

const legacyText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() && value.trim() !== UNFILLED_BANK_TEXT ? value.trim() : null

/** Creates the profile from the legacy `studio` settings once. Never overwrites an existing row. */
export async function ensureShopProfile(db: Db): Promise<void> {
  const [row] = await db.select().from(settings).where(eq(settings.key, SETTINGS_KEY)).limit(1)
  const legacy = (row?.value ?? DEFAULT_CONTACT) as LegacyStudio
  const email = legacyText(legacy.contactEmail)
  const phones = Array.isArray(legacy.phones)
    ? legacy.phones.filter((p): p is string => typeof p === "string" && p.trim() !== "")
    : []
  const bank = legacy.bank ?? {}
  await db
    .insert(shopProfile)
    .values({
      id: ID,
      displayName: "Ceraghit Creation",
      email,
      notifyEmail: email,
      phones,
      bankHolder: legacyText(bank.holder),
      bankName: legacyText(bank.bank),
      bankIban: legacyText(bank.iban),
      bankBic: legacyText(bank.bic),
    })
    .onConflictDoNothing({ target: shopProfile.id })
}

export async function getShopProfile(db: Db): Promise<ShopProfileRow> {
  const read = () => db.select().from(shopProfile).where(eq(shopProfile.id, ID)).limit(1)
  const [row] = await read()
  if (row) return row
  await ensureShopProfile(db)
  const [created] = await read()
  return created!
}

export async function updateShopProfile(
  db: Db,
  patch: Partial<typeof shopProfile.$inferInsert>,
): Promise<ShopProfileRow> {
  await ensureShopProfile(db)
  const [row] = await db
    .update(shopProfile)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(eq(shopProfile.id, ID))
    .returning()
  return row!
}

export function toShopProfile(row: ShopProfileRow): ShopProfile {
  const { id: _id, shippingConfirmedAt, onboardedAt, updatedAt, ...rest } = row
  return {
    ...rest,
    shippingConfirmedAt: shippingConfirmedAt?.toISOString() ?? null,
    onboardedAt: onboardedAt?.toISOString() ?? null,
    updatedAt: updatedAt.toISOString(),
  }
}

export function publicShopProfile(row: ShopProfileRow): PublicShopProfile {
  const { displayName, legalName, legalForm, taxId, address, postalCode, city, country, phones, email } = row
  return { displayName, legalName, legalForm, taxId, address, postalCode, city, country, phones, email }
}

/** Studio notifications go to the notify address, then the public one. */
export const studioInbox = (row: ShopProfileRow): string | null => row.notifyEmail ?? row.email
