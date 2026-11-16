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

## Configurer Aramex (dashboard, Livraison)

Admin only (`admin.shipping.*`). The owner picks Manuel or Aramex, fills the form, clicks "Tester la connexion" (works with
unsaved values, never stores them, 10 tests per 10 minutes) and saves. The test shows which step failed, `login`
(identifiants refusés) or `rate` (entité du compte ou type de produit), with fixed French messages only.

- Nom d'utilisateur: the API user's e-mail. Ask the rep for "un accès API Shipping Services (ShippingAPI.V2)".
- Mot de passe and PIN du compte: write-only, kept in the vault, shown as "Configurée".
- Numéro de compte: digits only, on the Aramex invoices. Entité du compte: 3 letters, often `TUN`. Pays du compte: `TN`.
- Types de produit national (`DOM`, default `ONP`) and international (`EXP`, default `PPX`): ask the rep which ProductType
  codes are allowed on the account.
- Mode réel: only in production, after the owner confirms the product types (switch in the form) and `labelReportId`, `paymentType`, `deliveredCodes` are set explicitly in the config (no defaults until #198 verifies them, no form field yet). Outside
  production the test host is used even if a row says live. Aramex without complete credentials falls back to manual
  shipping and the page says so.
- `/health` reports `shipping: "<provider>:<environment>"`.
- Env fallback (credentials only, always the test host; live needs the dashboard settings): `ARAMEX_USERNAME`, `ARAMEX_PASSWORD`, `ARAMEX_ACCOUNT_NUMBER`, `ARAMEX_ACCOUNT_PIN`,
  `ARAMEX_ACCOUNT_ENTITY`, `ARAMEX_ACCOUNT_COUNTRY_CODE`.
