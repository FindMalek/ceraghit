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

/** A one page PDF, enough for a browser to open and print a demo label. */
const LABEL_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 288 432]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n" +
    "4 0 obj<</Length 63>>stream\nBT /F1 18 Tf 24 380 Td (DEMO LABEL - not a real parcel) Tj ET\nendstream endobj\n" +
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R/Size 6>>\n%%EOF\n",
).toString("base64")

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
    if (url.endsWith("/CreateShipments")) {
      const sent = JSON.parse(String(init?.body ?? "{}")) as { Shipments?: { Reference1?: string }[] }
      const reference = sent.Shipments?.[0]?.Reference1 ?? ""
      if (reference.endsWith("-FAKE-REFUSED")) {
        return reply({
          HasErrors: false,
          Notifications: [],
          Shipments: [
            {
              ID: "",
              Reference1: reference,
              HasErrors: true,
              Notifications: [{ Code: "ERR52", Message: "Consignee city is not valid" }],
            },
          ],
        })
      }
      const id = `FAKE${String(Math.abs([...reference].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7))).padStart(8, "0")}`
      return reply({
        HasErrors: false,
        Notifications: [],
        Shipments: [
          {
            ID: id,
            Reference1: reference,
            HasErrors: false,
            Notifications: [],
            ShipmentLabel: { LabelURL: null, LabelFileContents: LABEL_PDF },
            ShipmentAttachments: [],
          },
        ],
      })
    }
    if (url.endsWith("/PrintLabel")) {
      return reply({
        HasErrors: false,
        Notifications: [],
        ShipmentNumber: "",
        ShipmentLabel: { LabelURL: null, LabelFileContents: LABEL_PDF },
      })
    }
    if (url.endsWith("/CalculateRate")) return reply(info?.AccountPin === "fake-bad-rate" ? RATE_ERROR : RATE)
    return reply({ Transaction: null, Notifications: [], HasErrors: false })
  }) as typeof fetch
}
