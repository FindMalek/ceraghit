import { isAramexUrl } from "./endpoints"

export const FAKE_CITIES = [
  "Ariana",
  "Bizerte",
  "Djerba Houmt Souk",
  "Gabès",
  "Hammamet",
  "Kairouan",
  "La Marsa",
  "Monastir",
  "Nabeul",
  "Sfax",
  "Sousse",
  "Tunis",
]

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
export function createFakeAramexFetch(passthrough: typeof fetch = fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    // The api hands this to every outbound call (Resend, ...): only Aramex is answered here, nothing else is faked.
    if (!isAramexUrl(url)) return passthrough(input, init)
    const info = (JSON.parse(String(init?.body ?? "{}")) as { ClientInfo?: { Password?: string; AccountPin?: string } })
      .ClientInfo
    const reply = (body: unknown) => new Response(JSON.stringify(body))
    if (info?.Password === "fake-bad-login") return reply(LOGIN_ERROR)
    if (url.endsWith("/FetchCities"))
      return reply({ Transaction: null, Notifications: [], HasErrors: false, Cities: FAKE_CITIES })
    if (url.endsWith("/ValidateAddress")) {
      const sent = JSON.parse(String(init?.body ?? "{}")) as { Address?: { City?: string; Line1?: string } }
      const typed = sent.Address?.City ?? ""
      const known = FAKE_CITIES.some((c) => c.toLowerCase() === typed.toLowerCase())
      if (known && (sent.Address?.Line1 ?? "").toLowerCase().includes("habib bourgiba")) {
        return reply({
          Transaction: null,
          Notifications: [],
          HasErrors: false,
          SuggestedAddresses: [{ Line1: "Avenue Habib Bourguiba", City: typed, PostCode: "1000", CountryCode: "TN" }],
        })
      }
      return reply({
        Transaction: null,
        Notifications: [],
        HasErrors: false,
        SuggestedAddresses: known
          ? []
          : [{ Line1: sent.Address?.Line1 ?? "", City: "Sousse", PostCode: "4000", CountryCode: "TN" }],
      })
    }
    if (url.endsWith("/FetchCountries")) return reply(COUNTRIES)
    if (url.endsWith("/CalculateRate")) return reply(info?.AccountPin === "fake-bad-rate" ? RATE_ERROR : RATE)
    return reply({ Transaction: null, Notifications: [], HasErrors: false })
  }) as typeof fetch
}
