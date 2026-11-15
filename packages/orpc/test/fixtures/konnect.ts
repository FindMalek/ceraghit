// Shapes from the Konnect v2 docs, amounts assumed in minor units: confirm on the sandbox (docs/payments.md).
export const initPaymentResponse = { payUrl: "https://pay.test/x", paymentRef: "ref1" }

export function getPaymentResponse(
  overrides: Partial<{ status: string; amount: number; token: string; orderId: string }> = {},
) {
  return { payment: { status: "completed", amount: 3400, token: "EUR", orderId: "CER-1", ...overrides } }
}
