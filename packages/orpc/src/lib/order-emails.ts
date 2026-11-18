import { mailLog, orders } from "@workspace/db"
import { bankFromProfile, type CarrierId } from "@workspace/sdk"
import { and, eq } from "drizzle-orm"
import type { Services } from "../context"
import {
  renderOrderConfirmation,
  renderOrderExpired,
  renderPaymentReceived,
  renderShipped,
  renderStudioNewOrder,
} from "../emails/confirmation"
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
    await deliverMail(services, "order_confirmation", await renderOrderConfirmation(order, ctx), {
      orderId,
      inline: true,
      locale: order.locale,
    })
    if (studio) {
      await deliverMail(services, "order_studio", await renderStudioNewOrder(order, ctx, studio), {
        orderId,
        inline: true,
        locale: order.locale,
      })
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
    await deliverMail(services, "payment_received", await renderPaymentReceived(loaded.order, loaded.ctx), {
      orderId,
      inline: true,
      locale: loaded.order.locale,
    })
  } catch (error) {
    console.error("[payment received email]", error)
  }
}

/** Tells the customer an unpaid order was released after `days` days. Never throws. */
export async function sendOrderExpiredEmail(services: Services, orderId: string, days: number): Promise<void> {
  try {
    const loaded = await loadMail(services, orderId)
    if (!loaded) return
    await deliverMail(services, "order_expired", await renderOrderExpired(loaded.order, loaded.ctx, days), {
      orderId,
      inline: true,
      locale: loaded.order.locale,
    })
  } catch (error) {
    console.error("[order expired email]", error)
  }
}

/**
 * Tells the customer the order shipped. One mail per order: a logged mail (even a failed one, which the owner resends
 * from the dashboard) blocks a second. Never throws.
 */
export async function sendShippedEmail(services: Services, orderId: string): Promise<void> {
  try {
    const loaded = await loadMail(services, orderId)
    if (!loaded) return
    const { carrier, carrierName, trackingNumber, trackingUrl } = loaded.order
    if (!carrier) return
    const shipment = { carrier: carrier as CarrierId, carrierName, trackingNumber, trackingUrl }
    const sent = await services.db
      .select({ id: mailLog.id })
      .from(mailLog)
      .where(and(eq(mailLog.orderId, orderId), eq(mailLog.kind, "shipped")))
      .limit(1)
    if (sent.length) return
    await deliverMail(services, "shipped", await renderShipped(loaded.order, shipment, loaded.ctx), {
      orderId,
      inline: true,
      locale: loaded.order.locale,
    })
  } catch (error) {
    console.error("[shipped email]", error)
  }
}
