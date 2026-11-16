/**
 * Not verified yet (docs PDFs return 403 to fetchers, no credentials): confirm with the Aramex rep or the first
 * sandbox call (#198), and mirror any change in docs/aramex.md.
 * - test host `ws.dev.aramex.net` (timed out from outside, probably IP allow-listed)
 * - WCF date format `/Date(ms+hhmm)/` in both directions
 * - `LabelFileContents` is base64 or a number array (both are parsed)
 * - `Version` ("v1.0") and `Source` values
 * - label ReportID (9201) and ReportType ("URL" or "RPT"), commercial invoice ReportID
 * - ProductType codes (EXP PPX/PDX/DPX/GPX, DOM ONP/OND/CDS), PaymentType (P/C/3)
 * - Services codes (CODS cash on delivery, INSR insurance)
 * - tracking UpdateCode values (SH005 = delivered)
 * - Contact `Type` and unit strings (KG, CM)
 */
export const ARAMEX_HOSTS = { live: "https://ws.aramex.net", test: "https://ws.dev.aramex.net" } as const

export type AramexService = "Shipping" | "RateCalculator" | "Tracking" | "Location"

export function serviceUrl(host: string, service: AramexService, operation: string): string {
  return `${host.replace(/\/+$/, "")}/ShippingAPI.V2/${service}/Service_1_0.svc/json/${operation}`
}

const ALLOWED_HOSTS = new Set(Object.values(ARAMEX_HOSTS).map((h) => new URL(h).hostname))

/** Label URLs come from a provider response: only https on an Aramex host is ever fetched. */
export function isAramexUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === "https:" &&
      url.port === "" &&
      (ALLOWED_HOSTS.has(url.hostname) || url.hostname.endsWith(".aramex.net"))
    )
  } catch {
    return false
  }
}
