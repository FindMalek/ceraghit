import type { Db } from "@workspace/db"
import { demoRef, newDemoNonce, orders, parseDemoRef } from "@workspace/db"
import type { Currency } from "@workspace/sdk"
import { and, eq } from "drizzle-orm"
import type { AppEnv, Services } from "../context"
import { publicError } from "../errors"
import { getIntegration } from "./integrations"
import { withSpan } from "./telemetry"

export interface InitPayment {
  orderNumber: string
  amountMinor: number
  currency: Currency
  customer: { name: string; email: string; phone: string }
  description: string
  successUrl: string
  failUrl: string
  webhookUrl: string
}

export interface PaymentCheck {
  status: "paid" | "pending" | "failed"
  amountMinor: number
  currency: Currency | null
  orderNumber: string | null
}

/** One gateway behind two calls. Payment status only ever comes from `check`, never from a request. */
export interface PaymentProvider {
  name: "konnect" | "demo"
  mode: "test" | "live"
  init(input: InitPayment): Promise<{ payUrl: string; ref: string }>
  check(ref: string): Promise<PaymentCheck>
}

/** Whether card payment may be offered: production only through live Konnect, never the demo gateway. */
export async function gatewayReady(services: Services): Promise<boolean> {
  if (services.config.appEnv !== "production") return true
  const payments = await resolvePayments(services)
  return payments.name === "konnect" && payments.mode === "live"
}

const KONNECT_HOSTS = { test: "https://api.preprod.konnect.network/api/v2", live: "https://api.konnect.network/api/v2" }

export const KONNECT_LIVE_ONLY_PRODUCTION = "Les clés Konnect réelles ne sont acceptées qu'en production."
export const KONNECT_NEEDS_LIVE = "La production exige les clés Konnect réelles."

/**
 * The gateway to use right now: keys the owner saved in the dashboard win, then the env-built default
 * (`services.payments`). Live keys saved outside production are ignored, never used.
 */
export async function resolvePayments(services: Services): Promise<PaymentProvider> {
  const found = await getIntegration(services, "konnect")
  if (!found || found.source !== "db") return services.payments
  const apiKey = found.secrets.apiKey
  const walletId = found.config.walletId
  if (!apiKey || typeof walletId !== "string" || !walletId) return services.payments
  const mode = found.config.mode === "live" ? "live" : "test"
  if (mode === "live" && services.config.appEnv !== "production") return services.payments
  return new KonnectProvider(apiKey, walletId, mode, services.http)
}

export interface KonnectCheck {
  ok: boolean
  message: string
}

/**
 * Asks Konnect for a payment that cannot exist: a refused key answers 401/403, an accepted one 404. Creates nothing
 * and never calls init-payment. Fixed messages only, nothing Konnect said reaches the owner.
 */
export async function testKonnectKey(
  apiKey: string,
  mode: "test" | "live",
  http: typeof fetch = fetch,
): Promise<KonnectCheck> {
  try {
    const res = await http(`${KONNECT_HOSTS[mode]}/payments/${crypto.randomUUID()}`, {
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(8000),
    })
    if (res.status === 401 || res.status === 403) return { ok: false, message: "Clé API refusée par Konnect." }
    if (res.ok || res.status === 404) {
      return { ok: true, message: "Clé API acceptée par Konnect. L'identifiant du portefeuille n'est pas vérifié." }
    }
  } catch {}
  return { ok: false, message: "Konnect ne répond pas. Réessayez dans un instant." }
}

export class KonnectProvider implements PaymentProvider {
  readonly name = "konnect" as const

  constructor(
    private apiKey: string,
    private walletId: string,
    readonly mode: "test" | "live",
    private http: typeof fetch = fetch,
  ) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.http(`${KONNECT_HOSTS[this.mode]}${path}`, {
      ...init,
      headers: { "x-api-key": this.apiKey, "content-type": "application/json" },
    })
    if (!res.ok) {
      console.error(`[konnect ${path}]`, res.status, await res.text().catch(() => ""))
      throw publicError("BAD_GATEWAY", "payment_service_down", "The payment service did not answer. Please try again.")
    }
    return (await res.json()) as T
  }

  async init(input: InitPayment) {
    return withSpan("payments.init", { provider: this.name, "payment.mode": this.mode }, async () => {
      const [firstName, ...rest] = input.customer.name.split(" ")
      const res = await this.call<{ payUrl: string; paymentRef: string }>("/payments/init-payment", {
        method: "POST",
        body: JSON.stringify({
          receiverWalletId: this.walletId,
          amount: input.amountMinor,
          token: input.currency,
          type: "immediate",
          lifespan: 30,
          orderId: input.orderNumber,
          description: input.description,
          firstName,
          lastName: rest.join(" ") || firstName,
          email: input.customer.email,
          phoneNumber: input.customer.phone,
          webhook: input.webhookUrl,
          successUrl: input.successUrl,
          failUrl: input.failUrl,
          silentWebhook: true,
          checkoutForm: false,
          acceptedPaymentMethods: ["bank_card", "wallet", "e-DINAR"],
        }),
      })
      return { payUrl: res.payUrl, ref: res.paymentRef }
    })
  }

  async check(ref: string): Promise<PaymentCheck> {
    return withSpan("payments.get", { provider: this.name, "payment.mode": this.mode }, async () => {
      const { payment } = await this.call<{
        payment: { status: string; amount: number; token?: string; orderId?: string }
      }>(`/payments/${encodeURIComponent(ref)}`)
      const status = payment.status === "completed" ? "paid" : payment.status === "failed" ? "failed" : "pending"
      const token = payment.token?.toUpperCase()
      return {
        status,
        amountMinor: payment.amount,
        currency: token === "TND" || token === "EUR" ? token : null,
        orderNumber: payment.orderId ?? null,
      }
    })
  }
}

/** Boot guard: the demo gateway must never sit behind card payments in production. */
export function assertNoDemoInProduction(env: { appEnv: AppEnv; onlinePayments: boolean }, payments: PaymentProvider) {
  if (env.appEnv === "production" && env.onlinePayments && payments.name === "demo") {
    throw new Error("production cannot take card payments through the demo gateway")
  }
}

/**
 * Local and preview checkout without a gateway: the web app shows a fake page where you pick the outcome.
 * Stateless: the outcome lives in the order's payment ref (see `demoRef`), so an api restart forgets nothing.
 */
export class DemoProvider implements PaymentProvider {
  readonly name = "demo" as const
  readonly mode = "test" as const

  constructor(private webUrl: string) {}

  async init(input: InitPayment) {
    const ref = demoRef({
      outcome: "pending",
      orderNumber: input.orderNumber,
      amountMinor: input.amountMinor,
      currency: input.currency,
      nonce: newDemoNonce(),
    })
    return { ref, payUrl: `${this.webUrl}/checkout/demo?ref=${encodeURIComponent(ref)}&order=${input.orderNumber}` }
  }

  async check(ref: string): Promise<PaymentCheck> {
    const payment = parseDemoRef(ref)
    if (!payment) return { status: "failed", amountMinor: 0, currency: null, orderNumber: null }
    return { ...payment, status: payment.outcome }
  }

  /**
   * Moves a pending payment to its outcome by rewriting the order's ref. `mismatch` is paid with the wrong amount.
   * Returns the new ref, or null when the ref is unknown or was already resolved.
   */
  async resolve(db: Db, ref: string, outcome: "paid" | "failed" | "mismatch"): Promise<string | null> {
    const payment = parseDemoRef(ref)
    if (!payment || payment.outcome !== "pending") return null
    const next = demoRef({
      ...payment,
      outcome: outcome === "failed" ? "failed" : "paid",
      amountMinor: outcome === "mismatch" ? payment.amountMinor + 1 : payment.amountMinor,
    })
    const [row] = await db
      .update(orders)
      .set({ paymentRef: next })
      .where(and(eq(orders.paymentRef, ref), eq(orders.status, "pending_payment")))
      .returning({ id: orders.id })
    return row ? next : null
  }
}
