import { type Db, settings } from "@workspace/db"
import { DEFAULT_SHIPPING_RATES, type StudioSettings, studioSettingsSchema } from "@workspace/sdk"
import { eq } from "drizzle-orm"

const KEY = "studio"

export const DEFAULT_SETTINGS: StudioSettings = {
  contactEmail: "ceraghit@yahoo.fr",
  phones: ["+216 98 425 075", "+32 478 27 45 79"],
  whatsapp: null,
  instagram: null,
  shippingRates: DEFAULT_SHIPPING_RATES,
  shippingNote: null,
}

export async function getSettings(db: Db): Promise<StudioSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY)).limit(1)
  const parsed = studioSettingsSchema.safeParse(row?.value)
  return parsed.success ? parsed.data : DEFAULT_SETTINGS
}

export async function saveSettings(db: Db, value: StudioSettings): Promise<void> {
  await db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
}
