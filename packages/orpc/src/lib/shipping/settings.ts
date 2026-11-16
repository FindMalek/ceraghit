import { type Db, settings } from "@workspace/db"
import { type ShippingSettings, shippingSettingsSchema } from "@workspace/sdk"
import { eq } from "drizzle-orm"

const KEY = "shipping"
const DEFAULT: ShippingSettings = { provider: "manual", quoteFromProvider: false }

export async function getShippingSettings(db: Db): Promise<ShippingSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY)).limit(1)
  const parsed = shippingSettingsSchema.safeParse(row?.value)
  return parsed.success ? parsed.data : DEFAULT
}

export async function saveShippingSettings(db: Db, value: ShippingSettings): Promise<void> {
  await db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
}
