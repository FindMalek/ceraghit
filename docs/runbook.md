# runbook

Operator notes for the production shop. Deploys are in `docs/deploy.md`, payments in `docs/payments.md`.

## cookies and storage (no consent banner)

The privacy page (`legal.docs.privacy`, "Cookies et stockage local") states this decision. Every cookie and storage key the
apps set, from `grep` for `cookies().set`, `document.cookie`, `localStorage` and zustand `persist`:

| where | name | what | needed because |
| --- | --- | --- | --- |
| web cookie | `NEXT_LOCALE` | chosen language, session cookie (next-intl) | the site renders in that language |
| web localStorage | `ceraghit-cart` | cart lines | the cart survives a reload |
| web localStorage | `ceraghit-order-tokens` | order number to access token | the customer reopens their order without an account |
| web cookie | `ceraghit_currency` | currency override, only read outside production | previews and tests, never set in production |
| dashboard cookie | `ceraghit_admin` | owner session, httpOnly | login |
| dashboard cookie | `sidebar_state` | sidebar open or closed | interface preference |

All are strictly necessary or a pure interface preference, nothing is shared with a third party, and there is no analytics,
pixel or advertising script (fonts are self-hosted by `next/font`). Under the ePrivacy rules that needs no consent banner.

Adding analytics, a pixel, an embedded video or any third-party script means adding a consent banner first (nothing may load
before the visitor accepts), and updating the cookie section of the privacy page in fr, en and ar.

## retention

| data | kept | then |
| --- | --- | --- |
| orders and their invoices | 10 years (accounting) | anonymise the customer fields, below |
| custom requests and their photos | 12 months after the last exchange | delete the request, below |
| uploads no row uses | 30 days unused | the daily `cleanup-uploads` cron deletes the file |

Nothing deletes requests automatically: the 12 months are applied by hand, once a month. `custom_requests` has no
last-exchange column, so `created_at` is the closest date; before deleting, check in the shop mailbox that the
conversation really ended more than 12 months ago (a request still being discussed is kept).

```sql
select id, name, status, created_at from custom_requests where created_at < now() - interval '12 months' order by created_at;
```

## erasure request (GDPR art. 17)

Answer within one month, from the contact address of the shop. Check who is asking: the request must come from the email
address on the order or request.

1. Custom requests from that email: delete the row. Its photos are no longer referenced, so the daily cleanup removes them
   from the bucket 30 days later (earlier: delete them from the media screen of the dashboard).

   ```sql
   delete from custom_requests where lower(email) = lower('<email>');
   ```

2. Orders from that email: they are accounting records, so they stay until they are 10 years old. Tell the customer which
   legal obligation keeps them. Orders older than 10 years are anonymised, never deleted (totals and numbers stay):

   ```sql
   update orders
   set customer_name = 'anonymisé', email = 'anonymise@invalid', phone = '', address = '', city = '', postal_code = null, note = null
   where lower(email) = lower('<email>') and created_at < now() - interval '10 years';
   ```

3. Access or portability request: export the customer's orders and requests as a table (`select * from orders where
   lower(email) = lower('<email>')`) and send it by email.
4. Keep a line with the date and what was done in the shop's own notes, not in the database.

Run these against the production `DATABASE_URL` (Neon, direct connection) with `psql`, after checking the row count with a
`select` using the same `where`.
