# deploy

Production is Vercel + Neon + Cloudflare R2. Previews run on the-keep (Dokploy) with their own database and bucket.
Nothing is shared between the two: see `.cursor/rules/02-environments-and-payments.mdc` for the matrix.

## CI runners

Every workflow runs on self-hosted runners on the-keep (`runs-on: [self-hosted, the-keep]`), so no GitHub-hosted
minutes are used. Three runners, `the-keep-ceraghit-1..3`, live in `/opt/actions-runner/FindMalek/ceraghit-<n>` as
systemd services (`actions.runner.FindMalek-ceraghit.the-keep-ceraghit-<n>`); each runs one job at a time, so three
keep lint, types, test and build parallel. Node, pnpm and Bun come from the setup actions and are cached on the host.

- status: `gh api repos/FindMalek/ceraghit/actions/runners --jq '.runners[] | "\(.name) \(.status)"'`
- logs: `ssh the-keep 'journalctl -u actions.runner.FindMalek-ceraghit.the-keep-ceraghit-1 -n 50'`
- reinstall one: see `the-keep/player/docs/ci/self-hosted-runner.md`, with a fresh token from
  `gh api -X POST repos/FindMalek/ceraghit/actions/runners/registration-token`
- the runner user is in the `docker` group (image builds, the Postgres service container): only this repo's own
  workflows should run here, never fork PRs

## previews (every PR from this repo)

`.github/workflows/preview.yml` on every PR push:

1. builds `ghcr.io/findmalek/ceraghit-{api,web,dashboard}:pr-<n>` (Turborepo remote cache + buildx cache)
2. Dokploy project `ceraghit-previews`: Postgres `ceraghit-db-pr-<n>` and the three apps on
   `pr-<n>.ceraghit.findmalek.engineer`, `pr-<n>-dashboard.…`, `pr-<n>-api.…`, `BOOTSTRAP=true` so the api migrates and
   seeds the catalogue and demo orders
3. a sticky PR comment (Vercel style) with status, visit links, dashboard login, database url and API docs, plus a GitHub
   deployment (`preview-pr-<n>`) so the PR shows "View deployment"
4. payments use the demo gateway, or the Konnect **sandbox** when `KONNECT_TEST_*` secrets exist

Postgres is published on port `15000 + <n>` of the-keep (LAN and tailnet only). `pnpm db:shell pr-<n>` opens psql over ssh.
Closing the PR deletes the apps, database, uploads (`pr-<n>/` in `ceraghit-dev`) and marks the deployment inactive.

## production (merge to main)

`.github/workflows/deploy.yml`, in the `production` GitHub environment:

1. `migrate`: applies Drizzle migrations to Neon and creates/updates the owner login (`admin-cli.ts`)
2. `deploy`: `vercel pull/build/deploy --prebuilt --prod` for `apps/api`, `apps/web`, `apps/dashboard` (Vercel's Git
   integration is **disconnected**, so Vercel posts no preview comments; deploys come only from this workflow)
3. `smoke`: `/health` must report `konnect:live`, storefront and dashboard must answer

The api does not migrate itself in production (`BOOTSTRAP=false`). The first real catalogue is loaded once with
`DATABASE_URL=<neon> pnpm db:seed:catalog`; after that the owner edits everything in the dashboard.

## one-time setup

**Vercel, the short way**: `cp docs/production.env.example .env.production.local`, fill it in, `vercel login`, then
`scripts/vercel-setup.sh <team-slug>`. It creates and links `ceraghit-api|web|dashboard`, disconnects their Git
integration and pushes the production env vars; it prints the project ids to put in GitHub. Then add the domains in each
project. The long way, by hand:

**Vercel** (team: yours, Pro): create three projects from this repo with root directories `apps/api`, `apps/web`,
`apps/dashboard`; Settings → Git → disconnect (or set "Ignored Build Step" to `exit 0`); add the env vars below to each.
Domains: `ceraghit.<tld>` (web), `dashboard.…`, `api.…`.

| project | env (Production only) |
| :-- | :-- |
| api | `APP_ENV=production`, `DEPLOY_ENV=production`, `DATABASE_URL` (Neon **pooled** url), `DB_POOL_MAX=5`, `WEB_URL`, `API_PUBLIC_URL`, `KONNECT_API_KEY`, `KONNECT_WALLET_ID`, `KONNECT_MODE=live`, `SEED_DEMO=false`, `BOOTSTRAP=false`, `S3_ENDPOINT`, `S3_REGION=auto`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL` |
| web | `APP_ENV=production`, `API_URL` (api origin), `WEB_URL` |
| dashboard | `APP_ENV=production`, `API_URL`, `WEB_URL` |

**Neon**: one project, production branch; keep the pooled connection string as `DATABASE_URL`.

**Cloudflare R2**: bucket `ceraghit-prod`, a public custom domain (`cdn.<domain>`) for `S3_PUBLIC_URL`, an API token scoped
to that bucket, and a CORS rule allowing `PUT` from the dashboard **and the web** origins (product photos are uploaded by
the dashboard, customer photos on `/custom` by the storefront, both straight to the bucket; the web ones are limited to
5 MB and signed with their exact size and type).

**Garage** (the-keep): bucket `ceraghit-dev` with key `ceraghit-dev-key` (previews and local), CORS allowing `PUT` from
`*.ceraghit.findmalek.engineer`.

**DNS** (Vercel DNS, `findmalek.engineer`): `ceraghit` and `*.ceraghit` CNAME → `home.findmalek.engineer`.

**GitHub** repo variables: `PREVIEW_ENABLED=true` (previews) and later `DEPLOY_ENABLED=true` (production deploys, only once the `production` environment is complete), `DOKPLOY_PUBLIC_URL`, `PREVIEW_DOMAIN=ceraghit.findmalek.engineer`,
`PREVIEW_DB_HOST` (the-keep tailnet ip), `S3_ENDPOINT`, `PREVIEW_S3_BUCKET=ceraghit-dev`, `PREVIEW_ADMIN_EMAIL`,
`TURBO_API=https://turbo.findmalek.engineer`, `TURBO_TEAM=ceraghit`.
Repo secrets (preview scope): `DOKPLOY_API_KEY`, `TURBO_TOKEN`, `PREVIEW_ADMIN_PASSWORD`, `PREVIEW_S3_ACCESS_KEY_ID`,
`PREVIEW_S3_SECRET_ACCESS_KEY`, optional `KONNECT_TEST_API_KEY` / `KONNECT_TEST_WALLET_ID`, optional `GHCR_READ_TOKEN`
(classic PAT `read:packages`), `PROJECT_TOKEN` (classic PAT `project`, for `project.yml`).
`production` environment variables: `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_API|WEB|DASHBOARD`, `PRODUCTION_WEB_HOST`,
`PRODUCTION_API_HOST`, `PRODUCTION_DASHBOARD_HOST`, `ADMIN_EMAIL`. `production` environment secrets: `VERCEL_TOKEN`,
`DATABASE_URL` (Neon, direct url for migrations), `ADMIN_PASSWORD`.

## check before the first production deploy

- api on Vercel: `apps/api/api/index.ts` re-exports the fetch handler and `vercel.json` rewrites every path to it. Verify
  `/health` and a `/rpc` call on the first deploy; if the function entry needs another shape, only `apps/api/api` changes.
- Konnect live keys and the answers in issue #1 (EUR with foreign cards, settlement, fees).
