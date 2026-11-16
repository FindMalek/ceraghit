# Aramex

Typed JSON client (`fetch` + zod, no SOAP) in `packages/orpc/src/lib/shipping/`. `ShippingProvider` is implemented by
`ManualShippingProvider` and `AramexShippingProvider`; callers only use the interface.

## What the owner provides

An Aramex account from the Aramex rep: user name, password, account number, PIN, account entity (e.g. `TUN`), account
country code. Password and PIN go in the vault (`docs/secrets.md`), the rest are non-secret `aramex` config keys
(`userName`, `accountNumber`, `accountEntity`, `accountCountryCode`, `mode` = `test` | `live`). No credentials are in the repo.

## Behavior

- Timeouts via `AbortSignal.timeout` (10 s default). Calls that are safe to repeat retry twice (300 ms, 900 ms) on
  network errors, timeouts and 5xx. `CreateShipments` and `CreatePickup` never retry.
- `HasErrors` and a failed entry in `Shipments[]` become `AramexError` with a French owner message. Visitors only get
  `guestMessage`. Request bodies (password, PIN) are never logged or put in an error.
- Aramex has no CancelShipment: `cancel` puts the waybill on hold.
- Money is never converted: an EUR quote is asked in EUR and a rate in another currency is treated as no answer.

## Not verified yet (confirm in the sandbox, #198)

Test host (`ws.dev.aramex.net`), WCF date format, `LabelFileContents` shape, `Version`/`Source`, label and invoice
`ReportID`, ProductType codes, PaymentType, `CODS`/`INSR` service codes, tracking `UpdateCode` values (`SH005` delivered),
Contact `Type`, unit strings. All of them live in `endpoints.ts` and `aramex/provider.ts` (`AramexConfig`).

## Live guard and limits

- `createShippingProvider` refuses `mode: "live"` unless `productTypes`, `labelReportId`, `paymentType` and `deliveredCodes`
  are passed explicitly: the defaults are unverified guesses and only apply in `test` mode (until #198 verifies them).
- `accountCountry` and `accountEntity` (sent as `OriginEntity`, e.g. `TUN`) come from the saved credentials.
- Per call `timeoutMs` and `retries` (e.g. 4 s and 0 for checkout quotes, 20 s and 0 for creating a shipment).
- A `LabelURL` is only downloaded over `https` from an Aramex host, never an arbitrary address.
- `testConnection` runs FetchCountries then a Tunis to Sousse CalculateRate and returns the steps it passed.
- Tracking URLs are not part of `ShippingProvider` (carrier registry, #274).
