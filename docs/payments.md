# payments

Gateway: **Konnect** (Tunisian payment facilitator, Central Bank of Tunisia licence). The studio has a patente, so it can
open a merchant account; payout is to a Tunisian bank account in TND.

## why not the others

- **Stripe**: Tunisia is not a supported country; a Wise account alone does not change that (Stripe needs a legal entity
  and bank account in a supported country: Belgium works, a US LLC via Atlas costs $500 + ~$100/yr).
- **Polar, Lemon Squeezy, Paddle**: merchant-of-record products for digital goods; Polar's policy lists physical products
  as prohibited.
- **Gumroad**: physical items allowed but hosted checkout only (no cart, stock or dual currency) and Tunisia is absent
  from its official bank-payout list.

## Konnect facts

- Fees (konnect.network/pricing, indicative): Tunisian cards and e-DINAR 1.3%, international cards 2.9%, bank transfer 2 TND.
  No subscription or setup fee.
- API: `POST https://api.konnect.network/api/v2/payments/init-payment` (sandbox host `api.preprod.konnect.network`), header
  `X-Api-Key`. Body: `receiverWalletId`, `amount` (minor units), `token` (currency), `orderId`, `webhook`, `successUrl`,
  `failUrl`, `acceptedPaymentMethods` (`bank_card`, `wallet`, `e-DINAR`), `lifespan` (minutes), customer fields. Returns
  `payUrl` and `paymentRef`. Status: `GET /payments/{paymentRef}`.
- The webhook is `?payment_ref=…`, unsigned. We always re-fetch the payment and compare amount, currency and order number
  (`packages/orpc/src/lib/orders.ts` `settleOrder`).
- Accounts: `dashboard.sandbox.konnect.network` (test) and `dashboard.konnect.network` (live), separate keys.

## to confirm with Konnect (issue #1)

EUR checkout with foreign Visa/Mastercard and settlement currency; settlement delay and minimum payout; KYB documents beyond
the patente; final rate for international cards; whether the amount field in `GET /payments/{ref}` is minor units (the
sandbox test decides, `settleOrder` refuses to mark paid on a mismatch).
