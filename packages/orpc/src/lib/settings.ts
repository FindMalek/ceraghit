import { type Db, settings } from "@workspace/db"
import { DEFAULT_SHIPPING_RATES, type StudioSettings, studioSettingsSchema } from "@workspace/sdk"
import { eq } from "drizzle-orm"

export const SETTINGS_KEY = "studio"

/** The contact a fresh shop profile starts from when no settings were ever saved. */
export const DEFAULT_CONTACT = {
  contactEmail: "ceraghit@yahoo.fr",
  phones: ["+216 98 425 075", "+32 478 27 45 79"],
}

export const DEFAULT_SETTINGS: StudioSettings = {
  whatsapp: null,
  instagram: null,
  shippingRates: DEFAULT_SHIPPING_RATES,
  shippingNote: null,
}

export async function getSettings(db: Db): Promise<StudioSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.key, SETTINGS_KEY)).limit(1)
  const parsed = studioSettingsSchema.safeParse(row?.value)
  return parsed.success ? parsed.data : DEFAULT_SETTINGS
}

/** Keeps legacy keys already stored (contact, bank) so the shop profile backfill never loses them. */
export async function saveSettings(db: Db, value: StudioSettings): Promise<void> {
  const [row] = await db.select().from(settings).where(eq(settings.key, SETTINGS_KEY)).limit(1)
  const stored = row?.value && typeof row.value === "object" ? row.value : {}
  const merged = { ...stored, ...value }
  await db
    .insert(settings)
    .values({ key: SETTINGS_KEY, value: merged })
    .onConflictDoUpdate({ target: settings.key, set: { value: merged } })
}
