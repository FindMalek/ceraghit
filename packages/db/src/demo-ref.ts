export type DemoOutcome = "pending" | "paid" | "failed"

export interface DemoPayment {
  outcome: DemoOutcome
  orderNumber: string
  amountMinor: number
  currency: "TND" | "EUR"
  /** Random per payment, so nobody can build the ref of an order they did not place. */
  nonce: string
}

const NONCE = /^[0-9a-f]{32}$/

export function newDemoNonce(): string {
  return crypto.randomUUID().replaceAll("-", "")
}

/** The demo gateway keeps no state of its own: the payment ref on the order says what happened, so restarts forget nothing. */
export function demoRef({ outcome, orderNumber, amountMinor, currency, nonce }: DemoPayment): string {
  return `demo:${outcome}:${orderNumber}:${amountMinor}:${currency}:${nonce}`
}

export function parseDemoRef(ref: string): DemoPayment | null {
  const [prefix, outcome, orderNumber, amount, currency, nonce, ...rest] = ref.split(":")
  const amountMinor = Number(amount)
  if (prefix !== "demo" || rest.length || !orderNumber || !Number.isInteger(amountMinor)) return null
  if (outcome !== "pending" && outcome !== "paid" && outcome !== "failed") return null
  if (currency !== "TND" && currency !== "EUR") return null
  if (!nonce || !NONCE.test(nonce)) return null
  return { outcome, orderNumber, amountMinor, currency, nonce }
}
