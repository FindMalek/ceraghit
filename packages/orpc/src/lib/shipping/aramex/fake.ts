const COUNTRIES = {
  Transaction: null,
  Notifications: [],
  HasErrors: false,
  Countries: [{ Code: "TN", Name: "Tunisia" }],
}
const RATE = {
  Transaction: null,
  Notifications: [],
  HasErrors: false,
  TotalAmount: { CurrencyCode: "TND", Value: 8.5 },
  RateDetails: { Amount: 7.14, OtherAmount1: 0, TotalAmountBeforeTax: 7.14, TaxAmount: 1.36 },
}
const LOGIN_ERROR = {
  Transaction: null,
  Notifications: [{ Code: "ERR75", Message: "ClientInfo - Failed to login using Portal Service" }],
  HasErrors: true,
}
const RATE_ERROR = {
  Transaction: null,
  Notifications: [{ Code: "ERR61", Message: "ProductType is not valid for this account" }],
  HasErrors: true,
}

/**
 * Sandbox-only stand-in for Aramex (screenshots, demos): nothing leaves the process. The api only wires it when
 * ARAMEX_FAKE=true, which `apps/api/src/env.ts` refuses with APP_ENV=production.
 * Password `fake-bad-login` fails the login step, PIN `fake-bad-rate` fails the rate step, anything else works.
 */
export function createFakeAramexFetch(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const info = (JSON.parse(String(init?.body ?? "{}")) as { ClientInfo?: { Password?: string; AccountPin?: string } })
      .ClientInfo
    const reply = (body: unknown) => new Response(JSON.stringify(body))
    if (info?.Password === "fake-bad-login") return reply(LOGIN_ERROR)
    if (url.endsWith("/FetchCountries")) return reply(COUNTRIES)
    if (url.endsWith("/CalculateRate")) return reply(info?.AccountPin === "fake-bad-rate" ? RATE_ERROR : RATE)
    return reply({ Transaction: null, Notifications: [], HasErrors: false })
  }) as typeof fetch
}
