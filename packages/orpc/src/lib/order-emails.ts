import { orders } from "@workspace/db"
import { bankFromProfile } from "@workspace/sdk"
import { eq } from "drizzle-orm"
import type { Services } from "../context"
import { renderOrderConfirmation, renderPaymentReceived, renderStudioNewOrder } from "../emails/confirmation"
import { deliverMail } from "./mail-log"
import { getShopProfile, studioInbox } from "./shop-profile"

async function loadMail(services: Services, orderId: string) {
  const { db, config } = services
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId), with: { items: true } })
  if (!order) return null
  const profile = await getShopProfile(db)
  const studio = studioInbox(profile)
  return {
    order,
    studio,
    ctx: {
      webUrl: config.webUrl,
      bank: bankFromProfile(profile),
      contactEmail: profile.email ?? studio ?? "",
      studio,
    },
  }
}

/** Customer and studio each get one mail when an order is confirmed (paid online, or placed as cash on delivery or bank transfer). */
export async function sendOrderEmails(services: Services, orderId: string): Promise<void> {
  try {
    const loaded = await loadMail(services, orderId)
    if (!loaded) return
    const { order, ctx, studio } = loaded
    await deliverMail(services, "order_confirmation", renderOrderConfirmation(order, ctx), { orderId, inline: true })
    if (studio) {
      await deliverMail(services, "order_studio", renderStudioNewOrder(order, studio), { orderId, inline: true })
    }
  } catch (error) {
    console.error("[order emails]", error)
  }
}

/** Tells the customer the owner confirmed their payment. Never throws. */
export async function sendPaymentReceivedEmail(services: Services, orderId: string): Promise<void> {
  try {
    const loaded = await loadMail(services, orderId)
    if (!loaded) return
    await deliverMail(services, "payment_received", renderPaymentReceived(loaded.order, loaded.ctx), {
      orderId,
      inline: true,
    })
  } catch (error) {
    console.error("[payment received email]", error)
  }
}
