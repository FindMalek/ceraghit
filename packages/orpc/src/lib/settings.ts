import { type Db, settings } from "@workspace/db"
import {
  type AiSettings,
  aiSettingsSchema,
  bankFromProfile,
  DEFAULT_HOLDS,
  DEFAULT_SHIPPING_RATES,
  type PaymentMethodFlags,
  type PaymentSettings,
  paymentSettingsSchema,
  readTutorialLinks,
  type StudioSettings,
  studioSettingsSchema,
  type TutorialLinks,
} from "@workspace/sdk"
import { eq } from "drizzle-orm"
import type { Services } from "../context"
import { gatewayReady } from "./payments"
import { getShopProfile } from "./shop-profile"

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

const PAYMENTS_KEY = "payments"

/** Until the owner saves the payments page, card payment follows the ONLINE_PAYMENTS env flag. */
export async function getPaymentSettings(db: Db, config: { onlinePayments: boolean }): Promise<PaymentSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.key, PAYMENTS_KEY)).limit(1)
  const parsed = paymentSettingsSchema.safeParse(row?.value)
  if (row && parsed.success) return parsed.data
  return { methods: { online: config.onlinePayments, cod: true, transfer: true }, holds: DEFAULT_HOLDS }
}

export async function savePaymentSettings(db: Db, value: PaymentSettings): Promise<void> {
  await db
    .insert(settings)
    .values({ key: PAYMENTS_KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
}

/**
 * The switches as they apply right now: card is off whatever was saved when the gateway is not ready. If card was the
 * only method saved for Tunisia or abroad, cod or transfer comes back so the shop never silently stops taking orders.
 * Last, transfer goes off while the shop profile has no complete bank account, in every environment.
 */
export async function effectivePaymentMethods(
  services: Pick<Services, "db" | "payments" | "config">,
): Promise<PaymentMethodFlags> {
  const { methods } = await getPaymentSettings(services.db, services.config)
  const online = methods.online && gatewayReady(services)
  const effective = online
    ? methods
    : { online, cod: methods.cod || methods.online, transfer: methods.transfer || methods.online }
  if (!effective.transfer) return effective
  const hasBank = bankFromProfile(await getShopProfile(services.db)) !== null
  return { ...effective, transfer: hasBank }
}

const AI_KEY = "ai"

export async function getAiSettings(db: Db): Promise<AiSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.key, AI_KEY)).limit(1)
  const parsed = aiSettingsSchema.safeParse(row?.value)
  return parsed.success ? parsed.data : aiSettingsSchema.parse({})
}

export async function saveAiSettings(db: Db, value: AiSettings): Promise<void> {
  await db.insert(settings).values({ key: AI_KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
}

const TUTORIALS_KEY = "tutorials"

export async function getTutorialLinks(db: Db): Promise<TutorialLinks> {
  const [row] = await db.select().from(settings).where(eq(settings.key, TUTORIALS_KEY)).limit(1)
  return readTutorialLinks(row?.value)
}

export async function saveTutorialLinks(db: Db, value: TutorialLinks): Promise<void> {
  await db
    .insert(settings)
    .values({ key: TUTORIALS_KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
}
