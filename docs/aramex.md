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

## Labels are private

`createShipment` (`packages/orpc/src/lib/shipping/shipments.ts`) stores the label PDF in the bucket under
`private/labels/<random uuid>.pdf` and counts it in `uploads` (folder `labels`). The dashboard only reads it through a
short-lived signed link (`admin.shipping.labelUrl`, `Storage.signedGet`, 5 minutes, attachment or inline to print). The
api never serves it: `/files/*` answers 404 for any key under `private/`, and the cleanup job only deletes from the image
folders. On top of that the label of an open parcel, and of one closed less than 90 days ago, is registered in
`STORAGE_REFERENCES`, so the cleanup keeps it whatever folder rule it uses.

If the label cannot be stored the shipment is kept with a `LABEL` error and the dashboard offers `Réessayer l'étiquette`.
`ARAMEX_FAKE=true` (never in production) answers every call from `aramex/fake.ts`, including a demo label PDF, so
previews and e2e create shipments with `environment: "fake"` and nothing leaves the process.

One limit to know: on Cloudflare R2 a bucket with a public custom domain serves every object by its key. The label key
is an unguessable random uuid that is never published or logged, so it cannot be found, but anyone who is handed the
key could fetch it anonymously. If that is not acceptable, give labels their own bucket without a public domain.

## International parcels and the commercial invoice

A destination outside Tunisia ships as `EXP` and needs a customs declaration, entered per shipment in the dashboard
dialog (prefilled from the order lines: title, quantity, weight, unit price x quantity, HS code `691390` as a suggestion,
origin `TN`). Values are in the order's own currency, never converted or summed across currencies; the total declares the
pieces only, not the delivery. Every piece needs an HS code of 4 to 10 digits (dots and spaces are removed). Cash on
delivery stays Tunisia and dinars only. There are no product-level HS fields yet: the owner types the code on each parcel.

The commercial invoice PDF comes from the `ShipmentAttachments` link of the create answer, else from
`PrintCommercialInvoice`. It is stored as `private/invoices/<uuid>.pdf` next to the label (same rules: signed 5 minute
link `admin.shipping.commercialInvoiceUrl`, `/files` answers 404, kept by `STORAGE_REFERENCES`). If it cannot be
stored the shipment is kept with an `INVOICE` error and the card offers `Réessayer la facture commerciale`.

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

## Villes et adresses

- Tunisian cities come from Aramex `FetchCities`, cached 7 days in `settings` (`aramex:cities:TN`), refreshed lazily with
  a 4 s limit. When Aramex is down the stale list is served; with no list the checkout stays free text and never blocks.
  Manual mode never calls Aramex and only serves the demo list (`fixture: true`, seeded from `DEMO_TN_CITIES`).
- `public.catalog.shippingCities` (rate limited, cache only, 50 results, accent and case insensitive) feeds the checkout
  picker. `createOrder` stores the list's spelling and refuses an unknown Tunisian city (`invalid_city`) only when a list exists.
- Dashboard: `Mettre à jour la liste des villes` (Livraison) and `Vérifier l'adresse avec Aramex` (order sheet,
  `ValidateAddress`; an Aramex failure answers `ok: false`, never a 500).
- Not done: country postcode rules (`postCodeRequired`) and `IsAddressServiced`.

## Suivi des colis

`track-shipments` (every 3 h, `POST /cron/track-shipments`) and the `Actualiser` button on the shipment card
(`admin.shipping.refresh`, 20 per 10 minutes) both run `trackShipments`: events are merged (one per code and time, the
newest 100 kept), the status comes from `aramex/status.ts` and never moves backwards, except into or out of `exception`.
`delivered` stores `deliveredAt` and closes the shipment (it is no longer polled); the order stays `fulfilled`. Hooks
`shipmentDelivered` / `shipmentException` (context `hooks`) fire once per transition, where the e-mail lane can plug in.

The customer order page shows one line in our own words (never Aramex's text, which is English and may hold internal
notes). The tracking codes in `aramex/status.ts` (`SH005`, `SH006`, `SH003`, `SH069`, `SH012`) are guesses until the
sandbox (#198); the English keywords are the fallback. The simulated Aramex tells its story from the waybill: `DELIVERED`
ends delivered, `PROBLEM` ends on an incident, anything else is in transit.
