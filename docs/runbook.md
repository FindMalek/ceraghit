# runbook

Operator notes for the production shop. The owner's guide is `docs/handover.md` (French). Deploys are in `docs/deploy.md`, payments in `docs/payments.md`, the go-live in `docs/release.md`.

## map

| what | where | who owns the account |
| :-- | :-- | :-- |
| storefront `ceraghit.com` (`www` redirects to it) | Vercel project `ceraghit-web` | studio team, operator admin |
| dashboard `dashboard.ceraghit.com` | Vercel `ceraghit-dashboard` | same |
| api `api.ceraghit.com` | Vercel `ceraghit-api` | same |
| database | Neon, production branch, pooled url | operator, owner billing |
| photos `cdn.ceraghit.com` | Cloudflare R2 bucket `ceraghit-prod` (backup bucket `ceraghit-backup`) | studio Cloudflare account |
| DNS | Cloudflare zone `ceraghit.com`, records DNS only (Vercel terminates TLS) | studio |
| mail | Resend, `EMAIL_FROM` on `ceraghit.com` | operator |
| card payments | Konnect (live keys saved by the owner in the dashboard vault) | studio |
| shipping | Aramex (credentials saved by the owner in the dashboard vault) | studio |
| translation | Groq (key in the vault) | operator |
| scheduler | Trigger.dev on `trigger.findmalek.engineer` (project `ceraghit`) | operator |
| logs, traces, metrics | OpenObserve `o2.findmalek.engineer` | operator |
| previews, staging | Dokploy on the-keep, Garage bucket `ceraghit-dev` | operator |

Real names, logins and who pays each account go in the operator's password manager, never in this repo.

## environment variables

`apps/api/src/env.ts` is the source of truth (it refuses a bad combination at boot); `docs/production.env.example` lists
the production names and `docs/deploy.md` ("one-time setup") has the per-app table. Set in Vercel (Production only) for
`ceraghit-api|web|dashboard`; the GitHub `production` environment holds only what the workflows need.

| name | api | web | dashboard | breaks when missing |
| :-- | :-- | :-- | :-- | :-- |
| `APP_ENV=production`, `DEPLOY_ENV=production` | yes | yes | yes | api refuses to boot, demo gateway or demo data could leak in |
| `DATABASE_URL` (Neon pooled), `DB_POOL_MAX=5` | yes | no | no | no api |
| `WEB_URL`, `API_PUBLIC_URL` / `API_URL` | yes | `API_URL`, `WEB_URL` | `API_URL`, `WEB_URL` | links in mails and proxies break |
| `PROXY_SECRET` (24+ chars, same value everywhere) | yes | yes | yes | api refuses to boot |
| `TRUSTED_PROXY_HOPS=1` | yes | default | default | see "rate limits" below |
| `SECRETS_KEY` (api only) | yes | no | no | provider keys cannot be saved or read, see `docs/secrets.md` |
| `S3_*`, `S3_PUBLIC_URL` | all | endpoint and public url only | same | no uploads, CSP blocks photos |
| `RESEND_API_KEY`, `EMAIL_FROM` | yes | no | no | no customer emails (they land in the failure page) |
| `ONLINE_PAYMENTS`, `KONNECT_*` | optional | no | no | card payment stays off |
| `OPENOBSERVE_*`, `LOG_LEVEL` | yes | yes | yes | nothing exported, boot unaffected |
| `MAIL_REDIRECT_TO` | never | never | never | production refuses to boot with it |

GitHub `production` environment: secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_API|WEB|DASHBOARD`,
`CRON_SECRET`, `DATABASE_URL` (direct url for migrations), `ADMIN_PASSWORD`, backup secrets; variables `ADMIN_EMAIL`,
`PRODUCTION_*_HOST`, `BACKUP_AGE_RECIPIENT`. Repository variable `DEPLOY_ENABLED=true` turns production deploys on.
Names only here, values live in the password manager. Compare names with `vercel env ls production --scope <team>`.

## deploys

Merge to `main` runs `.github/workflows/deploy.yml`: migration check, `migrate` on Neon, owner login update, then Vercel
build and deploy of the three apps, then `smoke`. A merge that only touches `apps/jobs/**` or `packages/sdk/src/jobs.ts`
also runs `jobs.yml`. Details and the previews/staging flow: `docs/deploy.md`. Full go-live sequence: `docs/release.md`.

- Redeploy without a code change: Actions, Deploy, "Run workflow" on `main`.
- A failed `migrate` stops the deploy before Vercel: fix forward with a new migration, never edit an applied one.
- The owner password is reset to the `ADMIN_PASSWORD` secret on every deploy (`packages/db/src/admin-cli.ts`). The
  dashboard has no change-password screen, so to change it: update the secret, run Deploy, hand the new password over in
  person. A password changed any other way does not exist.

### rollback

1. App problem: Vercel "Instant Rollback" per project to the previous production deployment, or
   `vercel rollback <deployment-url> --scope <team>`. Safe because migrations are additive, so the old code runs on the new
   schema. Roll back the three apps together when they share a change. A later merge redeploys the bad commit: revert it on `main`.
2. Data problem: Neon point-in-time restore to a new branch, check it, then repoint `DATABASE_URL` (Vercel and GitHub). Never `drizzle-kit drop`.
3. Feature problem: switch it off in the dashboard (payment methods on "Paiements", shipping back to Manuel) or `ONLINE_PAYMENTS=false`.
4. Secret leak: rotate (below), redeploy.

## migrations

Additive only (new tables, nullable or defaulted columns, indexes). To remove or rename something: expand in one release (add,
backfill, read both), contract in a later release with a `-- destructive-ok: <reason>` line, the `migration:destructive`
label (owner only) and `vars.ALLOW_DESTRUCTIVE_MIGRATION=true` for that one deploy. One open PR with a migration at a time.
Check locally with `node scripts/check-migrations.mjs --base origin/main`.

## secrets rotation

| secret | how |
| :-- | :-- |
| `SECRETS_KEY` | `docs/secrets.md`: new key with version + 1, set `SECRETS_KEY_PREVIOUS`, deploy, `pnpm --filter api secrets:rotate`, remove the old one, deploy |
| `CRON_SECRET` | new random value in Vercel api production, GitHub `production` secret and Trigger.dev `prod`; update staging and local `.env` separately |
| `PROXY_SECRET` | same new value on the three Vercel projects in one go, redeploy all three |
| Resend, R2, Neon | create the new credential, update Vercel (and GitHub for R2 backup keys), redeploy, revoke the old one |
| Konnect, Aramex, Groq | the owner saves the new value on "Paiements", "Livraison" or "Réglages" (vault); nothing to deploy |
| owner password | update `ADMIN_PASSWORD` (GitHub `production` secret), run the Deploy workflow |
| `TRIGGER_ACCESS_TOKEN` | `docs/jobs.md` |

## rate limits and unlocking the owner

See "rate limits" in `docs/deploy.md` for the numbers. Production runs `TRUSTED_PROXY_HOPS=1` on the api (Vercel overwrites
`x-forwarded-for`, so the rightmost entry is the real client; with 0 every visitor shares one socket address and one bucket,
see #380 and #381). The api ignores a client sent `x-forwarded-for` and a forged `x-ceraghit-client-ip` without `PROXY_SECRET`.
To unlock the owner after failed logins, in a SQL console on Neon (`scripts/db-shell.sh` for local):

```sql
delete from rate_limits where key like 'login:%';
```

## storage CORS (R2) and the tutorial videos

The bucket needs exactly the two rules in `docs/deploy.md` ("Cloudflare R2"): `PUT` from `https://ceraghit.com` and
`https://dashboard.ceraghit.com` (uploads), and `GET`/`HEAD` from the dashboard only (tutorial videos, which do not play at all
without it). Check from outside: `curl -sI -H "Origin: https://dashboard.ceraghit.com" https://cdn.ceraghit.com/<key>` must show
`access-control-allow-origin: https://dashboard.ceraghit.com`. Publishing videos: `docs/tutorials.md`.

## cron

| job | schedule (Africa/Tunis) |
| :-- | :-- |
| `cleanup-uploads` | daily 03:15 |
| `release-holds` | hourly :05 |
| `track-shipments` | every 3 h |
| `retry-mail` | every 10 min |
| `ai-usage-rollover` | 1st of the month 00:05 |

Trigger.dev calls `POST /cron/<name>` with the bearer `CRON_SECRET`; each run is a `job_runs` row and "Réglages" warns when a
job is stale. By hand: `curl -X POST -H "authorization: Bearer $CRON_SECRET" https://api.ceraghit.com/cron/<name>` (add
`?dryRun=1` to the cleanup to count without deleting). Scheduler setup and token rotation: `docs/jobs.md`. Table and stale
thresholds: `docs/deploy.md` ("scheduled jobs").

## monitoring

- `https://api.ceraghit.com/health` answers `{"ok":true,"db":true,"env":"production",...}`; `.github/workflows/uptime.yml` probes
  it every 10 min and opens a `production down` issue (label `incident`) on failure.
- OpenObserve dashboards and alerts: `docs/observability/`. Wiring status and what is still to configure:
  `docs/observability/production.md`.
- "Emails" page of the dashboard for failed sends; Vercel runtime logs per project as the fallback.

## incident checklist

1. Site down: `curl -s https://api.ceraghit.com/health`; if `db` is false check Neon status and the connection string; if
   the deployment is bad, roll back (above); check the latest Deploy run.
2. Payments failing: "Paiements" page, the `payments` field of `/health`, Konnect status. Orders never turn paid from request
   data: a webhook is only a hint and `settleOrder` re-asks Konnect. Stuck order: confirm with Konnect, then the owner uses "Marquer payée".
3. Emails failing: "Emails" page, Resend dashboard (domain verified, quota), `retry-mail` job run.
4. Bucket full: "Réglages" usage vs the 2.5 GB plan, run `cleanup-uploads` by hand (dry run first), ask the owner to delete unused photos.
5. Owner locked out: unlock query above; forgotten password: rotation row "owner password".
6. After any incident: write the cause and fix as an issue, link the `production down` issue.

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

## owner password

The owner changes it in the dashboard (Profil, "Changer mon mot de passe"): current password required, at least 12
characters, 5 wrong tries per 15 minutes, every other signed-in device is signed out, and the change is recorded as a
`settings` row `admin-audit:<admin id>:<time>` (never the password). A deploy never overwrites it. If it is lost: set the
`production` repository variable `ADMIN_PASSWORD_ROTATE` to `1`, update the `ADMIN_PASSWORD` secret, run Deploy, then
delete the variable. Never paste the password in an issue, a PR or a log.

## retention

| data | kept | then |
| --- | --- | --- |
| orders and their invoices | 10 years (accounting) | anonymise the customer fields, below |
| custom requests and their photos | 12 months after the last exchange | delete the request, below |
| uploads no row uses | 48 h if never confirmed, 30 days unused (warning the last 7) | the daily `media-cleanup` cron deletes the file |

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

## cutover to Dokploy (api only)

The production api is moving from Vercel to Dokploy (Traefik in front, like the previews); web and dashboard stay on Vercel.
Not implemented yet: `scripts/deploy/dokploy.mjs` has no production mode and `deploy.yml` still ships the api with
`vercel deploy`. Remaining, in order:

- [ ] `deploy.yml`: replace the api matrix entry with a Dokploy deploy (image build, push, Dokploy app update); keep web and dashboard on Vercel; migrations still run first.
- [ ] `dokploy.mjs`: a production mode with `APP_ENV=production`, `DEPLOY_ENV=production`, Neon `DATABASE_URL`, live S3 and `SECRETS_KEY` (never the preview helpers); `env.ts` still refuses a mismatch.
- [ ] `TRUSTED_PROXY_HOPS`: set `API_TRUSTED_PROXY_HOPS` (1 behind Traefik, 2 with the Cloudflare proxy) and check it with the spoofed `x-forwarded-for` probe in "rate limits" of `docs/deploy.md`. Vercel stops setting it for the api once it leaves.
- [ ] `PROXY_SECRET`: same value on the api (Dokploy) and the web and dashboard Vercel projects.
- [ ] Web and dashboard `API_URL` points at the new api host; redeploy both.
- [ ] `API_PUBLIC_URL` and `WEB_URL` on the api, then CORS and CSRF origins (the api allows `WEB_URL` and the dashboard origin): check a login and an order from both sites.
- [ ] `S3_PUBLIC_URL` and the CSP image sources still match the bucket; uploads and photos load.
- [ ] Trigger.dev: update `CERAGHIT_API_URL` (prod environment) to the new api URL and keep `CRON_SECRET`; run one job by hand.
- [ ] `PRODUCTION_API_HOST` (GitHub var) is the new host so the `deploy.yml` smoke and health checks hit the right api; Konnect webhook URL, if online payments are on, points at it too.
- [ ] After DNS moves: login, order, a cron run, and `docs/release.md` items re-ticked.
