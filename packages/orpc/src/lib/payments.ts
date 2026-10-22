import { ORPCError } from "@orpc/server"
import type { Currency } from "@workspace/sdk"

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
      throw new ORPCError("BAD_GATEWAY", { message: "The payment service did not answer. Please try again." })
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

/** Local and preview checkout without a gateway: the web app shows a fake page where you pick the outcome. */
export class DemoProvider implements PaymentProvider {
  readonly name = "demo" as const
  readonly mode = "test" as const
  private payments = new Map<string, PaymentCheck>()

  constructor(private webUrl: string) {}

  async init(input: InitPayment) {
    const ref = `demo_${crypto.randomUUID()}`
    this.payments.set(ref, {
      status: "pending",
      amountMinor: input.amountMinor,
      currency: input.currency,
      orderNumber: input.orderNumber,
    })
    return { ref, payUrl: `${this.webUrl}/checkout/demo?ref=${ref}&order=${input.orderNumber}` }
  }

  async check(ref: string) {
    return this.payments.get(ref) ?? { status: "failed" as const, amountMinor: 0, currency: null, orderNumber: null }
  }

  resolve(ref: string, outcome: "paid" | "failed"): boolean {
    const payment = this.payments.get(ref)
    if (!payment) return false
    this.payments.set(ref, { ...payment, status: outcome })
    return true
  }
}
