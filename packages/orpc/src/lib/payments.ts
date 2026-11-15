import type { Db } from "@workspace/db"
import { demoRef, orders, parseDemoRef } from "@workspace/db"
import type { Currency } from "@workspace/sdk"
import { and, eq } from "drizzle-orm"
import type { AppEnv } from "../context"
import { publicError } from "../errors"

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
export function gatewayReady(services: { payments: PaymentProvider; config: { appEnv: AppEnv } }): boolean {
  if (services.config.appEnv !== "production") return true
  return services.payments.name === "konnect" && services.payments.mode === "live"
}

const KONNECT_HOSTS = { test: "https://api.preprod.konnect.network/api/v2", live: "https://api.konnect.network/api/v2" }

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
  }

  async check(ref: string): Promise<PaymentCheck> {
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
