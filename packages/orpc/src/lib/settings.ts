import { type Db, settings } from "@workspace/db"
import {
  DEFAULT_SHIPPING_RATES,
  type PaymentMethodFlags,
  type PaymentSettings,
  PLACEHOLDER_BANK,
  paymentSettingsSchema,
  type StudioSettings,
  studioSettingsSchema,
} from "@workspace/sdk"
import { eq } from "drizzle-orm"
import type { Services } from "../context"
import { gatewayReady } from "./payments"

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

const PAYMENTS_KEY = "payments"

/** Until the owner saves the payments page, card payment follows the ONLINE_PAYMENTS env flag. */
export async function getPaymentSettings(db: Db, config: { onlinePayments: boolean }): Promise<PaymentSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.key, PAYMENTS_KEY)).limit(1)
  const parsed = paymentSettingsSchema.safeParse(row?.value)
  if (row && parsed.success) return parsed.data
  return { methods: { online: config.onlinePayments, cod: true, transfer: true } }
}

export async function savePaymentSettings(db: Db, value: PaymentSettings): Promise<void> {
  await db
    .insert(settings)
    .values({ key: PAYMENTS_KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
}

/** The switches as they apply right now: card is off whatever was saved when the gateway is not ready. */
export async function effectivePaymentMethods(
  services: Pick<Services, "db" | "payments" | "config">,
): Promise<PaymentMethodFlags> {
  const { methods } = await getPaymentSettings(services.db, services.config)
  return { ...methods, online: methods.online && gatewayReady(services) }
}
