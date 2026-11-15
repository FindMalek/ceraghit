import { type Db, settings } from "@workspace/db"
import {
  DEFAULT_SHIPPING_RATES,
  EMPTY_TUTORIAL_LINKS,
  PLACEHOLDER_BANK,
  type StudioSettings,
  studioSettingsSchema,
  type TutorialLinks,
  tutorialLinksSchema,
} from "@workspace/sdk"
import { eq } from "drizzle-orm"

const KEY = "studio"

export const DEFAULT_SETTINGS: StudioSettings = {
  contactEmail: "ceraghit@yahoo.fr",
  phones: ["+216 98 425 075", "+32 478 27 45 79"],
  whatsapp: null,
  instagram: null,
  shippingRates: DEFAULT_SHIPPING_RATES,
  shippingNote: null,
  bank: PLACEHOLDER_BANK,
}

export async function getSettings(db: Db): Promise<StudioSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY)).limit(1)
  const parsed = studioSettingsSchema.safeParse(row?.value)
  return parsed.success ? parsed.data : DEFAULT_SETTINGS
}

export async function saveSettings(db: Db, value: StudioSettings): Promise<void> {
  await db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
}

const TUTORIALS_KEY = "tutorials"

export async function getTutorialLinks(db: Db): Promise<TutorialLinks> {
  const [row] = await db.select().from(settings).where(eq(settings.key, TUTORIALS_KEY)).limit(1)
  const parsed = tutorialLinksSchema.safeParse(row?.value)
  return parsed.success ? parsed.data : EMPTY_TUTORIAL_LINKS
}

export async function saveTutorialLinks(db: Db, value: TutorialLinks): Promise<void> {
  await db
    .insert(settings)
    .values({ key: TUTORIALS_KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
}
