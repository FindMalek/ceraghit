import { E2E } from "../env"

const base = E2E.stubUrl

export const STUB_KONNECT_KEY = "e2e-konnect-key"

export interface StubPayment {
  ref: string
  orderId: string
  amount: number
  token: string
  status: string
}

export async function konnectPayments(): Promise<StubPayment[]> {
  return (await fetch(`${base}/__konnect/payments`)).json() as Promise<StubPayment[]>
}

export async function konnectPaymentFor(orderNumber: string): Promise<StubPayment> {
  const found = (await konnectPayments()).find((payment) => payment.orderId === orderNumber)
  if (!found) throw new Error(`no stub payment for ${orderNumber}`)
  return found
}

/** What Konnect would answer next for this payment, e.g. paid with another amount. */
export async function setKonnectPayment(ref: string, patch: Partial<StubPayment>): Promise<void> {
  await fetch(`${base}/__konnect/${encodeURIComponent(ref)}/status`, {
    method: "POST",
    body: JSON.stringify(patch),
  })
}

export type GroqMode = "ok" | "rate_limit" | "down" | "malformed" | "too_long" | "hang"

export async function setGroqMode(mode: GroqMode): Promise<void> {
  await fetch(`${base}/__groq/mode`, { method: "POST", body: JSON.stringify({ mode }) })
}

export async function groqRequests(): Promise<{ model: string; targets: string[]; auth: boolean }[]> {
  return (await fetch(`${base}/__groq/requests`)).json() as Promise<
    { model: string; targets: string[]; auth: boolean }[]
  >
}
