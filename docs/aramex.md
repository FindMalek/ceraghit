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

## Guessed values (confirm in the sandbox, then fix the one place that holds them)

Nothing below was verified against a real Aramex account. Tick a line when the rep or a sandbox call confirms it and
update the code named on the right. The Aramex docs PDFs return 403 to fetchers and no credentials exist yet.

| Guess | Value in code | Where |
| --- | --- | --- |
| Test host | `https://ws.dev.aramex.net` (timed out from outside, probably IP allow-listed) | `ARAMEX_HOSTS` in `aramex/endpoints.ts` |
| Live host | `https://ws.aramex.net` | same |
| `Source` and `Version` in `ClientInfo` | `Version` `v1.0`; `Source` is `null`, so it is omitted from the request | `lib/shipping/resolve.ts` |
| WCF date format | `/Date(ms+hhmm)/` in both directions | `aramex/dates.ts` |
| `LabelFileContents` | base64 string or number array, both parsed | `aramex/provider.ts` `decodeLabel` |
| Product types | DOM `ONP`, EXP `PPX` (others seen: `OND`, `CDS`, `PDX`, `DPX`, `GPX`) | `DEFAULT_ARAMEX_CONFIG.productTypes`, dashboard form |
| Payment type | `P` (prepaid; `C` collect, `3` third party) | `DEFAULT_ARAMEX_CONFIG.paymentType` |
| Service codes | `CODS` cash on delivery, `INSR` insurance | `aramex/provider.ts` `createShipment`, `insuranceServiceCode` |
| Label report | `ReportID` 9201, `ReportType` `URL` | `labelReportId`, `labelReportType` |
| Commercial invoice report | `ReportID` 9202, sent on EXP only | `commercialInvoiceReportId` |
| Tracking status codes | `BY_CODE`: `SH005` and `SH006` delivered, `SH003` out for delivery, `SH069` returned, `SH012` picked up; other codes fall back to English description keywords, else in transit | `lib/shipping/aramex/status.ts` |
| Delivered code (provider side) | `deliveredCodes: ["SH005"]` tells the provider's `track` a parcel is delivered, separate from the table above | `aramex/provider.ts` `DEFAULT_ARAMEX_CONFIG`, passed by `lib/shipping/resolve.ts` |
| Pickup | location `Atelier`, vehicle `Car`, package type `Box`, window Monday to Saturday in `Africa/Tunis` (UTC+1), at least 2 hours, last pickup 1 hour before closing | `pickupLocation`, `aramex/provider.ts` `createPickup`, `pickups.ts` `windowOf` |
| Contact `Type`, units | `KG`, `CM` | `aramex/provider.ts` |
| Cancel | no cancel operation: `HoldShipments` is used | `aramex/provider.ts` `cancel` |
| Customs | EXP goods declared in the order currency; `CustomsValueAmount` is the sum of the pieces, `ProviderHSCode` and `CommodityCode` both set | `aramex/provider.ts` `createShipment` |

`createShippingProvider` refuses `mode: "live"` until `productTypes`, `labelReportId`, `paymentType` and `deliveredCodes`
are passed explicitly, so a guess can never reach production by default.

## Sandbox checklist (the day credentials arrive)

Each step: do it on a preview with `ARAMEX_FAKE` unset, never on production.

1. [ ] Confirm the test host with the rep. If it is not `https://ws.dev.aramex.net`, change `ARAMEX_HOSTS.test` (one line).
2. [ ] Ask Aramex to allow-list the preview's egress IP if they filter by IP (previews run on the homelab, the-keep via Dokploy, not on Vercel).
3. [ ] Dashboard, Livraison: choose Aramex, enter the credentials in test mode, `Tester la connexion`. Both steps (`login`, `rate`) must be green.
4. [ ] Checkout on the preview with Aramex quotes on: a Tunisian cash on delivery order, a Tunisian card or demo order, a French EUR order. Check an EUR order is quoted in EUR (otherwise it stays on flat rates, nothing to change).
5. [ ] Create a domestic shipment (prepaid). The label PDF must print on the paper size the owner uses (`labelReportId`, `labelReportType`).
6. [ ] Create a domestic cash on delivery shipment. `CODS` and the amount in TND must appear on the label.
7. [ ] Create an international shipment to France with the customs declaration. Check the commercial invoice PDF (international shipments and the invoice are #194): goods, HS codes, values in the order currency, origin Tunisia.
8. [ ] Run `Actualiser` or `POST /cron/track-shipments`. Write down the real `UpdateCode` values and the delivered one, then set `deliveredCodes`.
9. [ ] Book a pickup, then cancel it.
10. [ ] Cancel (hold) a fresh shipment and ask the agency whether the hold is enough.
11. [ ] Compare the WCF dates and `LabelFileContents` with the fixtures in `packages/orpc/test` and replace them with anonymised real bodies.
12. [ ] Go live in production only after the owner signs off: set `labelReportId`, `paymentType`, `deliveredCodes` and the product types explicitly, enable live mode, check the first parcel end to end.

Test and live follow the same separation as Konnect: previews only ever use the test host, live exists only in production.

## Questions for the Aramex rep (French, to send as is)

1. API access : « Pouvez-vous activer l'accès API Shipping Services (ShippingAPI.V2, services Shipping, Rate Calculator, Tracking, Location) pour notre compte, et nous envoyer les identifiants de test puis de production : nom d'utilisateur API, mot de passe, numéro de compte, PIN du compte, code d'entité (AccountEntity), code pays du compte ? »
2. Environnement de test : « Quelle est l'adresse de l'environnement de test, et faut-il vous communiquer une adresse IP à autoriser ? C'est l'IP de sortie du serveur de prévisualisation (hébergé chez nous) qu'il faudrait autoriser. »
3. `Source` et `Version` : « Quelle valeur de Source et de Version devons-nous envoyer dans ClientInfo ? »
4. Types de produit : « Quels ProductType sont ouverts sur notre compte pour le national (DOM) et l'international (EXP) ? Lequel recommandez-vous pour des céramiques fragiles ? »
5. Paiement à la livraison : « Le paiement à la livraison (service CODS) est-il activé ? Quels frais, quel plafond, sous quel délai et sur quel compte reversez-vous les montants encaissés ? »
6. Euro et international : « Pouvez-vous nous donner des tarifs en euros (PreferredCurrencyCode=EUR) pour l'international, ou uniquement en dinars ? Qui paie les droits et taxes à l'arrivée (DAP ou DDP) ? La valeur en douane peut-elle être déclarée en EUR ? »
7. Objets fragiles : « Y a-t-il un service ou une assurance spécifique pour les objets fragiles (code de service INSR ?), et quelles règles d'emballage ? »
8. Étiquettes : « Quel ReportID et ReportType utiliser pour l'étiquette (format A4 ou A6) et pour la facture commerciale ? »
9. Enlèvements : « Comment se passent les enlèvements à l'atelier : heures limites, type de véhicule à indiquer, enlèvement régulier possible ? »
10. Annulation : « Comment annuler un envoi déjà créé par l'API (l'API n'a pas d'opération d'annulation) : la mise en attente (HoldShipments) suffit-elle ? »
11. Suivi : « Avez-vous la liste des codes de suivi (UpdateCode) et un système de notification (webhook) ? Sinon, à quelle fréquence pouvons-nous interroger TrackShipments ? »
12. Limites : « Y a-t-il des limites d'appels API par minute ou par jour ? »
13. Villes : « Pour la Tunisie, faut-il utiliser exactement les noms renvoyés par FetchCities ? Le code postal est-il obligatoire ? »
14. Douane : « Quel code SH (6 chiffres ou plus) pour des céramiques artisanales décoratives (6913) et de table (6912) ? La facture commerciale est-elle obligatoire pour la France et l'Europe, et dans quelle devise ? »
