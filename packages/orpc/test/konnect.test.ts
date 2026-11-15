import { expect, test } from "bun:test"
import { KonnectProvider } from "../src/lib/payments"
import { getPaymentResponse, initPaymentResponse } from "./fixtures/konnect"

function provider(
  respond: (url: string) => Response | Promise<Response>,
  calls: { url: string; body?: Record<string, unknown> }[] = [],
) {
  const http = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    return respond(url)
  }) as unknown as typeof fetch
  return new KonnectProvider("secret-key", "wallet", "test", http)
}

test("init sends minor units, the currency token, the order number and the webhook", async () => {
  const calls: { url: string; body?: Record<string, unknown> }[] = []
  const konnect = provider(() => Response.json(initPaymentResponse), calls)
  const init = await konnect.init({
    orderNumber: "CER-1",
    amountMinor: 3400,
    currency: "EUR",
    customer: { name: "Ada Lovelace", email: "a@b.c", phone: "123" },
    description: "d",
    successUrl: "s",
    failUrl: "f",
    webhookUrl: "https://api.test/webhooks/konnect",
  })
  expect(init).toEqual({ payUrl: "https://pay.test/x", ref: "ref1" })
  expect(calls[0]!.url).toBe("https://api.preprod.konnect.network/api/v2/payments/init-payment")
  expect(calls[0]!.body).toMatchObject({
    amount: 3400,
    token: "EUR",
    orderId: "CER-1",
    receiverWalletId: "wallet",
    webhook: "https://api.test/webhooks/konnect",
  })
})

test("check maps completed to paid, failed to failed, anything else to pending", async () => {
  const expected = { completed: "paid", failed: "failed", pending: "pending", something_new: "pending" } as const
  for (const [status, mapped] of Object.entries(expected)) {
    const konnect = provider(() => Response.json(getPaymentResponse({ status })))
    expect((await konnect.check("ref1")).status).toBe(mapped)
  }
})

test("check returns the amount, currency and order number to compare", async () => {
  const konnect = provider(() => Response.json(getPaymentResponse({ token: "tnd", amount: 12500, orderId: "CER-9" })))
  expect(await konnect.check("ref1")).toEqual({
    status: "paid",
    amountMinor: 12500,
    currency: "TND",
    orderNumber: "CER-9",
  })
})

test("a gateway error is a guest-safe BAD_GATEWAY and the key is never logged", async () => {
  const logged: string[] = []
  const original = console.error
  console.error = (...args: unknown[]) => void logged.push(args.map(String).join(" "))
  try {
    const konnect = provider(() => new Response("boom", { status: 500 }))
    await expect(konnect.check("ref1")).rejects.toMatchObject({ code: "BAD_GATEWAY" })
  } finally {
    console.error = original
  }
  expect(logged.join("\n")).not.toContain("secret-key")
})
