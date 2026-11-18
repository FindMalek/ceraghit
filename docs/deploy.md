# deploy

Production is Vercel + Neon + Cloudflare R2. Previews run on the-keep (Dokploy) with their own database and bucket.
Nothing is shared between the two: see `.cursor/rules/02-environments-and-payments.mdc` for the matrix.

## CI runners

CI (`ci.yml`) runs on GitHub-hosted `ubuntu-latest`. Preview, staging and deploy run on self-hosted runners on the-keep
(`runs-on: [self-hosted, the-keep]`); the small bookkeeping ones (commit lint, project board, PR auto-assign) use GitHub-hosted runners. Three runners, `the-keep-ceraghit-1..3`, live in `/opt/actions-runner/FindMalek/ceraghit-<n>` as
systemd services (`actions.runner.FindMalek-ceraghit.the-keep-ceraghit-<n>`); each runs one job at a time, so three
keep lint, types, test and build parallel. Node, pnpm and Bun come from the setup actions and are cached on the host.

- status: `gh api repos/FindMalek/ceraghit/actions/runners --jq '.runners[] | "\(.name) \(.status)"'`
- logs: `ssh the-keep 'journalctl -u actions.runner.FindMalek-ceraghit.the-keep-ceraghit-1 -n 50'`
- reinstall one: see `the-keep/player/docs/ci/self-hosted-runner.md`, with a fresh token from
  `gh api -X POST repos/FindMalek/ceraghit/actions/runners/registration-token`
- no GitHub cache: one pnpm store shared by all runners in `/opt/pnpm-store/shared` (`PNPM_STORE_DIR` in each runner's
  `.env`; warm it after a lockfile change with `pnpm fetch` from a single process, parallel cold installs saturate the
  home link and fail with `ETIMEDOUT`) and Docker layers in `/opt/buildx-cache/<app>` on the
  host (GitHub's cache service times out from the home connection and would only add a round trip). Prune with
  `docker builder prune -f --filter until=168h` and `rm -rf /opt/buildx-cache/*` if the disk fills
- the runner user is in the `docker` group (image builds, the Postgres service container): only this repo's own
  workflows should run here, never fork PRs

## previews (every PR from this repo)

`.github/workflows/preview.yml` on every PR push:

1. builds `ghcr.io/findmalek/ceraghit-{api,web,dashboard}:pr-<n>` (Turborepo remote cache + buildx cache), but only
   for the apps the PR affects (`turbo ls --affected`, dependents included). The others are retagged from `:main`
   (`docker buildx imagetools create`), which `.github/workflows/images-main.yml` rebuilds on every push to `main`.
   A change to `pnpm-lock.yaml`, `turbo.json`, root `package.json`, an app `Dockerfile` or `preview.yml` builds all
   three, and so does a missing `:main` image. The job summary lists which apps were built or reused. A new push to
   the same PR cancels the run in progress
2. Dokploy project `ceraghit-previews`: Postgres `ceraghit-db-pr-<n>` and the three apps on
   `pr-<n>.ceraghit.findmalek.engineer`, `pr-<n>-dashboard.…`, `pr-<n>-api.…`, `BOOTSTRAP=true` so the api migrates and
   seeds the catalogue and demo orders
3. a sticky PR comment (Vercel style) with status, visit links, dashboard login, database url and API docs, plus a GitHub
   deployment (`preview-pr-<n>`) so the PR shows "View deployment"
4. payments use the demo gateway, or the Konnect **sandbox** when `KONNECT_TEST_*` secrets exist
5. a Mailpit app `ceraghit-mail-pr-<n>` on `mail-pr-<n>.ceraghit.findmalek.engineer`, behind basic auth
   (`PREVIEW_MAILPIT_AUTH`, `user:password`), linked in the PR comment. The api reaches it over the internal network
   (`MAILPIT_URL=http://<app name>:8025`, its send endpoint accepts any caller, the UI and read api need the login), so
   every preview mail keeps its full body there and is still redirected to `MAIL_REDIRECT_TO`. Without the secret the
   preview has no catcher and mails go through Resend as before. E2E reads mails with `test/e2e/support/mailpit.ts`
   (`MAILPIT_URL=https://user:password@mail-pr-<n>.…`). The Mailpit app is deleted with the PR

Postgres is published on port `15000 + <n>` of the-keep (LAN and tailnet only). `pnpm db:shell pr-<n>` opens psql over ssh.
Closing the PR deletes the apps, database, uploads (`pr-<n>/` in `ceraghit-dev`) and marks the deployment inactive.

## staging (permanent, on the-keep)

`.github/workflows/staging.yml` redeploys `main` to fixed hosts, **by hand only** (Actions → Staging → Run workflow; a merge to `main` ships to Vercel, not here), in the Dokploy project `ceraghit-staging`
with its own Postgres: web https://ceraghit.findmalek.engineer, dashboard https://dashboard.ceraghit.findmalek.engineer,
api https://api.ceraghit.findmalek.engineer (docs at `/v1/docs`). It is a preview-grade environment: demo payments (or
Konnect sandbox keys), demo data, the dev bucket under `staging/`, `noindex`. Variables: `STAGING_WEB_HOST`,
`STAGING_DASHBOARD_HOST`, `STAGING_API_HOST`, `STAGING_ADMIN_EMAIL`, `STAGING_MAIL_REDIRECT_TO`; secret `STAGING_ADMIN_PASSWORD`.

## production (merge to main)

`.github/workflows/deploy.yml`, in the `production` GitHub environment:

1. `migrate`: applies Drizzle migrations to Neon and creates/updates the owner login (`admin-cli.ts`)
2. `deploy`: `vercel pull`, `vercel build --prod` and `vercel deploy --prebuilt --prod` for `apps/api`, `apps/web`, `apps/dashboard` (Vercel's Git
   integration is **disconnected**, so Vercel posts no preview comments; deploys come only from this workflow)
3. `smoke`: `/health` must report `env:production` (and `konnect:live` if `onlinePayments` is true), storefront and dashboard must answer

Git integration stays disconnected and each `apps/<app>/vercel.json` also sets `git.deploymentEnabled` (`"**": false, "main": true`),
so only `main` could ever build, even if Git is reconnected by mistake. `migrate` only runs on `refs/heads/main`, so a manual
"Deploy" run from another branch skips all three jobs.

The api does not migrate itself in production (`BOOTSTRAP=false`). The first real catalogue is loaded once with
`DATABASE_URL=<neon> pnpm db:seed:catalog`; after that the owner edits everything in the dashboard.

### migrations

Neon is migrated before the new code ships and a Vercel rollback keeps the new schema, so every migration must work with the
previous release: additive only (new tables, nullable columns or columns with a default, indexes, `ADD VALUE`, backfills).
To remove or reshape something, expand then contract over two releases: add the new column, backfill, ship code that reads
both; later drop the old one in its own PR, with a `-- destructive-ok: <reason>` line above the statement and the
`migration:destructive` label, which only the owner adds (`vars.ALLOW_DESTRUCTIVE_MIGRATION=true` for that deploy).
Only one open PR may add a migration at a time: the lowest PR number goes first, the next one waits, rebases on main and
runs `pnpm db:generate` again. `node scripts/check-migrations.mjs --base origin/main` checks a branch locally (the
`Migrations` workflow on PRs, and `deploy.yml` again before it touches Neon).

## photo storage (2.5 GB plan)

Every file sent to the bucket is a row in `uploads` (key, folder, bytes). The dashboard compresses each photo to WebP
(2400px long side, quality 0.86) before the direct upload, refuses an upload past `STORAGE_QUOTA_BYTES` (2.5 GB, in
`packages/sdk`) and shows the usage in Réglages. `POST /cron/media-cleanup` (bearer `CRON_SECRET`, daily, `cleanup-uploads` is an alias until the schedule moves) runs two tiers:

- abandoned: an upload in an image folder (`media/`, `products/`, `categories/`, `locations/`) never confirmed as media is deleted 48 h after signing
- unused: a confirmed library image nothing shows (no product, category or location, no `s3:` string, not pinned with `keep`) is marked `unused_since`, shown with a warning for its last 7 days and deleted 30 days after the mark; used again it is unmarked. Customer request photos follow the same 30 days
- never touched: referenced or pinned files, bundled images, anything outside the image folders, keys in any `s3:` setting or registered in `STORAGE_REFERENCES` (`packages/orpc/src/lib/cleanup.ts`; other features that keep files in an image folder add their keys there)
- at most 200 files per run; rows go first (usage re-counted under a row lock), the R2 object after the commit, a failed removal is logged and counted in `errors`

Manual dry run, nothing is written or deleted (counts in the response and the `job_runs` row, keys in the api log):
`curl -X POST -H "authorization: Bearer $CRON_SECRET" "https://<api>/cron/media-cleanup?dryRun=1"`.
`cleanup-dev-bucket.yml` does the homelab bucket: files of closed PRs and anything older than 14 days except `staging/`
(staging is cleaned by the staging api's own run).

Jobs are `POST /cron/<name>` (bearer `CRON_SECRET`), each run is a row in `job_runs` and Réglages shows the last run of
every job with a stale warning. To add one, register it in `apps/api/src/cron.ts` and list it in
`packages/sdk/src/jobs.ts`. `release-holds` frees stock held by abandoned online checkouts; any scheduler can call it.

## rate limits

Limits are counted in the `rate_limits` table (fixed windows, shared by every api instance), keyed by the visitor's address:
login 5 failures per 15 min per address and 10 per hour per email, orders 10 per 10 min, order lookups 60 per 10 min,
unique piece requests 5 per hour, request photo uploads 12 per 10 min. Behind the `/api` proxy the api only sees the web
function, so the proxy forwards the real address in `x-ceraghit-client-ip` with `PROXY_SECRET`; the api ignores it without
the matching secret. The daily cleanup also deletes counters older than a day. To unlock the owner right away:
`delete from rate_limits where key like 'login:%'`. Optional on top: Vercel WAF rate limiting rules.

## scheduled jobs

Every job is `POST /cron/<name>` on the api (bearer `CRON_SECRET`), idempotent, and records each run in `job_runs`;
Réglages shows the last run of each job and warns when one is stale. The endpoint doesn't care who calls it, so the
scheduler can change without touching the api.

| job | schedule (Africa/Tunis) | stale after |
| :-- | :-- | :-- |
| `cleanup-uploads` (abandoned uploads, unused library, rate limits, mail log) | daily 03:15 | 26 h |
| `media-cleanup` (the same cleanup without the aliases) | daily 03:30 | 26 h |
| `release-holds` (stock held by abandoned checkouts) | hourly :05 | 2 h |
| `track-shipments` (Aramex poll) | every 3 h | 4 h |
| `retry-mail` (failed Resend sends) | every 10 min | 30 min |
| `ai-usage-rollover` (closes the AI quota, monthly) | 1st, 00:05 | 32 days |

The schedule still calls `cleanup-uploads` and not `media-cleanup`, because the alias is what also sweeps `rate_limits`
and the mail log; moving the daily call to `media-cleanup` is a separate change.

Scheduled today: `cleanup-uploads` and `release-holds`. `media-cleanup` has a handler but no task yet; `track-shipments`,
`retry-mail` and `ai-usage-rollover` are catalogued so Réglages lists them, and get their task when their lane registers a
handler in `apps/api/src/cron.ts`.

`apps/jobs` is the scheduler: a Trigger.dev project on the self-hosted instance https://trigger.findmalek.engineer,
part of the Lyterion stack on the-keep (its `infra/` owns the compose file, its CI upgrades it). One `schedules.task`
per job, which only calls the endpoint; the api keeps the body, the advisory lock and the `job_runs` row. `trigger.dev`
and `@trigger.dev/sdk` are pinned to the server version (`4.7.3`) in `apps/jobs/package.json`: upgrade them with the
stack, never alone. `.github/workflows/jobs.yml` deploys `--env prod` on a merge to `main` that touches `apps/jobs/**`
or `packages/sdk/src/jobs.ts`.

To add a job: register the handler in `apps/api/src/cron.ts`, list it in `packages/sdk/src/jobs.ts`, then add its
`schedules.task` in `apps/jobs/src/schedules.ts` **once the endpoint answers** (a task calling a missing endpoint gets a
404 and aborts every run).

Owner setup, once:

1. Create the project "ceraghit" on https://trigger.findmalek.engineer, with a `prod` and a `staging` environment.
2. Set two variables per environment, in the Trigger webapp, nothing else: `CERAGHIT_API_URL` and `CRON_SECRET`. `prod`
   is `https://api.ceraghit.com` with the production secret; `staging` is `https://api.ceraghit.findmalek.engineer`
   with a different one. No database, bucket, mail, payment or vault credential ever reaches the homelab.
3. A personal access token (Trigger profile → access tokens) as the `production` environment secret
   `TRIGGER_ACCESS_TOKEN`, and the project ref (`proj_…`) as the repository variable `TRIGGER_PROJECT_REF`. Without
   both, `jobs.yml` skips.
4. Run each task once from the Trigger dashboard and check the `job_runs` row on Réglages.

The-keep down means no job runs: the stale warning makes it visible. The fallback is Vercel Cron, which sends `GET`
with `authorization: Bearer $CRON_SECRET`: add `crons: [{ path, schedule }]` to `apps/api/vercel.json` and accept `GET`
on `/cron/*` only when the `user-agent` is `vercel-cron/1.0`. Not enabled, and never alongside Trigger.dev: one
scheduler at a time.

## one-time setup

**Vercel, the short way**: `cp docs/production.env.example .env.production.local`, fill it in, `npx vercel@65.9.0 login`, then
`scripts/vercel-setup.sh <team-slug>`, then `scripts/github-setup.sh` for the GitHub `production` environment. It creates and links `ceraghit-api|web|dashboard`, disconnects their Git
integration and pushes the production env vars; it prints the project ids to put in GitHub. Then add the domains in each
project. The long way, by hand:

**Vercel** (team: yours, Pro): create three projects (`ceraghit-api|web|dashboard`) and set **Root Directory** to `apps/<app>` (with "include source files outside the root directory" on): `deploy.yml` runs the
CLI from the repo root, and running it inside `apps/<app>` breaks the monorepo file paths (`File does not exist: apps/api/node_modules/...`). `scripts/vercel-setup.sh` sets this for you. Settings → Git →
never connect (`git.deploymentEnabled` in each `apps/<app>/vercel.json` limits builds to `main` anyway); add the env vars below to each.
Domains: `ceraghit.com` (web, `www` redirects to it), `dashboard.ceraghit.com`, `api.ceraghit.com`.

**DNS for ceraghit.com** (Cloudflare, registrar and nameservers): add each domain in its Vercel project, then create the
records Vercel shows (apex `A 76.76.21.21`, subdomains `CNAME cname.vercel-dns.com`) as **DNS only** (grey cloud), since
Vercel terminates TLS. `cdn.ceraghit.com` is attached to the R2 bucket from the R2 dashboard (Custom domains), no record to
write by hand. Resend needs its SPF/DKIM records on the same zone, and `commandes@ceraghit.com` as `EMAIL_FROM`.

| project | env (Production only) |
| :-- | :-- |
| api | `APP_ENV=production`, `DEPLOY_ENV=production`, `DATABASE_URL` (Neon **pooled** url), `DB_POOL_MAX=5`, `WEB_URL`, `API_PUBLIC_URL`, `ONLINE_PAYMENTS=false` (card payment off: Tunisia pays cash on delivery, the rest by bank transfer; turning it on needs `KONNECT_API_KEY`, `KONNECT_WALLET_ID`, `KONNECT_MODE=live`), `SEED_DEMO=false`, `BOOTSTRAP=false`, `S3_ENDPOINT`, `S3_REGION=auto`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL`, `RESEND_API_KEY`, `EMAIL_FROM` (an address on a domain verified in Resend, `onboarding@resend.dev` is refused). `MAIL_REDIRECT_TO` stays unset, production refuses it, `PROXY_SECRET` (required, 24+ random characters), `SECRETS_KEY` (optional until a provider reads the vault, then required; vault master key, api only, see `docs/secrets.md`), `OPENOBSERVE_URL`, `OPENOBSERVE_ORG=default`, `OPENOBSERVE_USER`, `OPENOBSERVE_PASSWORD`, `OPENOBSERVE_STREAM=ceraghit`, `LOG_LEVEL=info` (telemetry, see below) |
| web | `APP_ENV=production`, `DEPLOY_ENV=production`, `API_URL` (api origin), `WEB_URL`, `S3_ENDPOINT`, `S3_PUBLIC_URL` (same values as the api: they only feed the CSP, no keys), `PROXY_SECRET` (same value as the api), `OPENOBSERVE_*` and `LOG_LEVEL` (same values as the api) |
| dashboard | `APP_ENV=production`, `DEPLOY_ENV=production`, `API_URL`, `WEB_URL`, `S3_ENDPOINT`, `S3_PUBLIC_URL`, `PROXY_SECRET` (same value as the api), `OPENOBSERVE_*` and `LOG_LEVEL` (same values as the api) |

## observability

All three apps send traces, structured logs and business metrics to OpenObserve (`https://o2.findmalek.engineer`) over
OTLP/HTTP with basic auth, service names `ceraghit-api`, `ceraghit-web`, `ceraghit-dashboard`, tagged
`deployment.environment` (`local`, `pr-<n>`, `staging`, `production`). Nothing leaves while `OPENOBSERVE_URL`,
`OPENOBSERVE_USER` and `OPENOBSERVE_PASSWORD` are unset, and a missing value never blocks a boot (one warning line in
production).

- production: the five values come from `docs/production.env.example`, pushed by `scripts/vercel-setup.sh`; use the
  ingest-only service account `ceraghit-production`.
- previews and staging: repo variables `OPENOBSERVE_URL`, `OPENOBSERVE_ORG`, `OPENOBSERVE_STREAM` and secrets
  `OPENOBSERVE_USER`, `OPENOBSERVE_PASSWORD` (the `ceraghit-preview` account), read by `preview.yml` / `staging.yml`
  and passed to the Dokploy apps.
- dashboards, alerts and metric names: `docs/observability/README.md`, `dashboard.json` and `alerts.json`. Error alerting
  is there, not in Sentry (issue #142's step is covered by the "error logs" alert).

**Neon**: one project, production branch; keep the pooled connection string as `DATABASE_URL`.

**Cloudflare R2**: bucket `ceraghit-prod`, a public custom domain (`cdn.<domain>`) for `S3_PUBLIC_URL`, an API token scoped
to that bucket, and a CORS rule allowing `PUT` from the dashboard **and the web** origins (product photos are uploaded by
the dashboard, customer photos on `/custom` by the storefront, both straight to the bucket; the web ones are limited to
5 MB and signed with their exact size and type). Exact rule, nothing else (no `*`, no `GET`, the api never sends CORS headers either):

```json
[{ "AllowedOrigins": ["https://ceraghit.com", "https://dashboard.ceraghit.com"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3600 }]
```

**Garage** (the-keep): bucket `ceraghit-dev` with key `ceraghit-dev-key` (previews and local), CORS allowing `PUT` from
`*.ceraghit.findmalek.engineer`.

**DNS** (Vercel DNS, `findmalek.engineer`): `ceraghit` and `*.ceraghit` CNAME → `home.findmalek.engineer`.

**GitHub** repo variables: `PREVIEW_ENABLED=true` (previews) and later `DEPLOY_ENABLED=true` (production deploys, only once the `production` environment is complete), `DOKPLOY_PUBLIC_URL`, `PREVIEW_DOMAIN=ceraghit.findmalek.engineer`,
`PREVIEW_DB_HOST` (the-keep tailnet ip), `S3_ENDPOINT`, `PREVIEW_S3_BUCKET=ceraghit-dev`, `PREVIEW_ADMIN_EMAIL`, `PREVIEW_MAIL_REDIRECT_TO` (inbox that gets every preview email, still also kept in the preview's Mailpit),
`TURBO_API=https://turbo.findmalek.engineer`, `TURBO_TEAM=ceraghit`.
Repo secrets (preview scope): `DOKPLOY_API_KEY`, `TURBO_TOKEN`, `PREVIEW_ADMIN_PASSWORD`, `PREVIEW_MAILPIT_AUTH` (`user:password` for the preview mail UI), `PREVIEW_S3_ACCESS_KEY_ID`,
`PREVIEW_S3_SECRET_ACCESS_KEY`, optional `KONNECT_TEST_API_KEY` / `KONNECT_TEST_WALLET_ID`, optional `GHCR_READ_TOKEN`
(classic PAT `read:packages`), `PROJECT_TOKEN` (classic PAT `project`, for `project.yml`).
`production` environment variables: `PRODUCTION_WEB_HOST`,
`PRODUCTION_API_HOST`, `PRODUCTION_DASHBOARD_HOST`, `ADMIN_EMAIL`, `TRIGGER_PROJECT_REF` (see "scheduled jobs"). `production` environment secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_API|WEB|DASHBOARD`, `CRON_SECRET`,
`DATABASE_URL` (Neon, direct url for migrations), `ADMIN_PASSWORD`, `TRIGGER_ACCESS_TOKEN`.

## check before the first production deploy

- api on Vercel: `apps/api/api/index.ts` re-exports the fetch handler and `vercel.json` rewrites every path to it. Verify
  `/health` and a `/rpc` call on the first deploy; if the function entry needs another shape, only `apps/api/api` changes.
- Konnect live keys and the answers in issue #1 (EUR with foreign cards, settlement, fees).

## security headers

- **web and dashboard** (`proxy.ts`, built by `buildCsp` in `packages/sdk/src/security.ts`): a nonce CSP per request
  (`script-src 'self' 'nonce-…' 'strict-dynamic'`, `style-src 'self' 'unsafe-inline'`, `frame-ancestors 'none'`,
  `object-src 'none'`), `Cross-Origin-Opener-Policy: same-origin`, and HSTS (`max-age=63072000; includeSubDomains; preload`)
  only when `APP_ENV=production`. The bucket hosts come from `S3_ENDPOINT` and `S3_PUBLIC_URL` (images and the presigned
  PUT), the dashboard also allows the storefront origin for catalogue photos (`WEB_URL`), `https://www.youtube-nocookie.com`
  frames and `https://i.ytimg.com` thumbnails (Aide page); the storefront allows `https://*.konnect.network` as form target.
  Pages must stay dynamic (a prerendered page has no nonce).
- `CSP_REPORT_ONLY=true` on a web or dashboard app turns the policy into `Content-Security-Policy-Report-Only`
  (use it to try a new third party before enforcing).
- **api**: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, HSTS in production, `Cache-Control: no-store`
  on `/rpc`, `/v1`, `/health`, `/cron`, `/webhooks`. No `Access-Control-Allow-Origin` is ever sent: browsers only call the
  `/api` proxy of their own app. `/v1/docs`, `/v1/openapi.json` (and `/`, `/docs`) answer 404 in production, they stay on
  local and previews.
- **cookies**: the admin cookie is `HttpOnly; SameSite=Lax; Priority=High`, `Secure` outside local. It stays `Lax` and not
  `Strict` so a link to the dashboard from an email or chat keeps the session. The locale cookie is `Lax`, `Secure` in
  production; the currency cookie is only read (a local/preview testing aid).

## mail log

Every mail goes through `deliverMail` and leaves a row in `mail_log` (sent or failed, with the real recipient and the
body). Transient errors (network, 429, 5xx) are retried twice; a failure shows up under "Emails en échec" in the dashboard
with a banner until the owner resends or dismisses it. The same daily `cleanup-uploads` call deletes rows older than 90
days (bodies hold customer details).
