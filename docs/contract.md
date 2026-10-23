# contract and invoice notes

Working document so nothing gets forgotten. Legal names, addresses, tax ids and dates are left for the signing copy.

**Client:** Ceraghit Creation (Sabri Ghit) · **Provider:** Malek · **Project:** online shop for the Ceraghit 2027 catalogue

## price

| item | TND | status |
| :-- | --: | :-- |
| Development: storefront, dashboard, api, payments, deployment | 800 | agreed |
| Translations (Arabic and English on top of French) | 200 | agreed |
| Yearly: deployments and domain name | 135 / year | agreed |
| **Total, first year** | **1135** | |
| WhatsApp / Telegram integration | 200 | not included, out of scope |
| Live visitor statistics (Databuddy): who, from where, top pieces | 100 | not included, out of scope |

Konnect's transaction fees (1.3% Tunisian cards, 2.9% international cards, see `docs/payments.md`) are paid by the studio
out of its sales, not by the provider. The 135 TND yearly line covers the domain and keeping the production deployment
running; to confirm: whether it covers only those or also any usage above the free tiers of the hosting services.

## scope (included in the 800 TND)

1. Web shop for mobile and desktop: catalogue by category, product pages (photo gallery, variants such as glazed and
   unglazed), cart, checkout, order tracking page, search and sorting.
2. Prices in TND and EUR: the owner sets both for every product, customers choose their currency.
3. Online payment by card through Konnect (Tunisian and international cards).
4. Delivery price computed from each piece's weight and box size, per zone (Tunisia, Europe, rest of the world), with a
   free-delivery threshold, a rate card the owner edits and an estimator page. The rates start as estimates and are
   replaced by the studio's real carrier price list.
5. "Create a unique piece" request form with up to 3 photos; requests appear in the dashboard and the owner answers by
   email himself.
6. Dashboard (French): sales statistics in TND and EUR, products (create, edit, stock, variants, photos), categories (the
   menu), orders (with CSV export for the accountant), requests, workshop locations, contact details and delivery rates.
7. The 30 pieces of the 2027 catalogue loaded with their photos and descriptions, in the catalogue's visual identity.
8. French, English and Arabic (right-to-left) storefront. Draft legal pages (terms, delivery, legal notice, privacy) for
   the studio to complete and validate.
9. Search-engine basics: sitemap, page titles and descriptions, structured product data.
10. Production hosting set up and handed over (domain, hosting, database, image storage), plus a permanent staging copy
    to review changes before they go live.

## to settle before signing

- [ ] payment schedule (deposit / on delivery) and invoice dates
- [ ] who registers and owns the domain name, and in whose name hosting accounts are opened
- [ ] how many revision rounds are included after delivery
- [ ] delivery fees and which countries the studio ships to (settings in the dashboard)
- [ ] final TND prices and real stock per piece (the seed uses placeholders: euro price x 3.4)
- [ ] translations: Arabic and English are written, the studio (or a native speaker) reviews them, product names included
- [ ] legal pages: the studio completes the drafts (legal entity, patente and tax id, return policy) before launch
- [ ] ownership: source code and content are handed over after payment, brand assets stay the studio's
