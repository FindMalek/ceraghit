import type { Db } from "@workspace/db"
import { demoRef, newDemoNonce, orders, parseDemoRef } from "@workspace/db"
import type { Currency } from "@workspace/sdk"
import { and, eq } from "drizzle-orm"
import type { AppEnv, Services } from "../context"

export interface InitPayment {
  orderNumber: string
  amountMinor: number
  currency: Currency
  customer: { name: string; email: string; phone: string }
  description: string
  successUrl: string
  failUrl: string
}

export interface PaymentCheck {
  status: "paid" | "pending" | "failed"
  amountMinor: number
  currency: Currency | null
  orderNumber: string | null
}

/** One gateway behind two calls. Payment status only ever comes from `check`, never from a request. */
export interface PaymentProvider {
  name: string
  mode: "test" | "live"
  init(input: InitPayment): Promise<{ payUrl: string; ref: string }>
  check(ref: string): Promise<PaymentCheck>
}

/** Whether card payment may be offered. No real card gateway exists, so production never offers it. */
export function gatewayReady(services: Services): boolean {
  return services.config.appEnv !== "production"
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
