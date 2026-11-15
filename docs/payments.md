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

## current mode (dashboard "Paiements" page)

The owner switches card (Konnect), cash on delivery and bank transfer on or off in the dashboard (`/payments`), stored in
the `settings` row `payments` and enforced by `createOrder`. Fixed rules on top: cash on delivery is Tunisia + TND only,
transfer is abroad only, and the page refuses a save that leaves Tunisia or abroad without any method. Card payment is
only offered when the gateway can take real money: in production that means Konnect in `live` mode, the demo gateway
never qualifies (`gatewayReady`). Until the page is saved once, card follows `ONLINE_PAYMENTS` (default `false`), so
existing deployments keep their behaviour. Transfer orders carry the account from the dashboard settings and the order
number as the reference; the owner marks the order paid when the money arrives, then shipped.

## payoneer

The client wants to be paid through Payoneer. Payoneer sells two different things, and only one of them fits a small
studio today. Read on 2026-11-15; Payoneer pages change often, check again before building on a detail.

### payoneer checkout (card acceptance)

Ex optile / oscato platform.

- Server API spec (public swagger):
  https://developer.payoneer.com/checkout/yaml/checkout-server-payment-api_VI.yaml (same spec in other languages).
- Hosts: sandbox `https://api.sandbox.oscato.com/api`, live `https://api.live.oscato.com/api`. HTTP Basic auth, user =
  merchant code, password = payment token.
- `POST /lists` opens a session (hosted page or embedded) with our `transactionId`, `payment.amount` in **major units**
  (`27.95`), `payment.currency`, `payment.reference` and `callback.returnUrl/cancelUrl/notificationUrl`.
- Status: `GET /lists/{listId}` and `GET /charges/{chargeId}`. `status.code` includes `listed`, `pending`, `charged`,
  `paid_out`, `failed`, `declined`, `aborted`, `expired`, `canceled`, `charged_back`.
- Notifications: `callback.notificationUrl` (https, public IP) plus optional `callback.notificationHeaders`, static
  headers we choose; Payoneer support can also set extra headers for a whole division. The spec has no signature or HMAC
  scheme and no IP allowlist. https://checkoutdocs.payoneer.com/docs serves a JavaScript bot challenge that blocks
  automated browsers, so its notifications page was not read: treat signing as **not documented**. Same rule as Konnect:
  the notification is a hint, we re-fetch the LIST or CHARGE and compare amount, currency and `transactionId`.
- Verdict: **status is server-verifiable**, so a provider behind `PaymentProvider` is possible.
- Eligibility: **sales-gated**. The FAQ
  (https://payoneer.custhelp.com/app/answers/detail/a_id/40689/~/payoneer-checkout---faq) says early access is only for
  merchants with a **Hong Kong legal entity**, with a full risk assessment and a sales call; earlier research found a
  volume expectation around USD 20k/month. No self-serve sandbox credentials. Settlement goes to the Payoneer balance.
- Not usable for Ceraghit today. Tracked in issue #174 (blocked on a merchant account).

### payment requests (request a payment / payment link)

- Product: https://www.payoneer.com/solutions/send-payment-request/ and https://www.payoneer.com/learn/billing-services .
  Any account holder can send a payment request (email + link) or share a reusable payment link. The payer pays by
  card (around 3 to 3.99%), ACH or Payoneer balance; payer or receiver carries the fee. "Subject to eligibility"
  (https://www.payoneer.com/legal/fees/).
- API: only the platform Billing services API
  (https://www.payoneer.com/developers-docs/accounts-receivable/ar-billing-services/), built for platforms billing for
  their payees, credentials through sales only, USD 5,000 account volume for non-core countries, no public status
  endpoint.
- Verdict: **no verifiable status for a single merchant**. The method stays manual: the owner sends the link, sees the
  money in Payoneer, then confirms the order in the dashboard through the audited manual confirmation (issue #165). This
  is the one written exception to "payment status only comes from the gateway". Method: issues #168 and #169.

### to check in the owner's payoneer account

- is the account personal or business, and in which country is it registered
- can it send a payment request in EUR (send one to yourself, then cancel it)
- who carries the card fee on payment requests (payer or you)
- is there a Hong Kong entity, now or planned (the only path to Payoneer Checkout)
