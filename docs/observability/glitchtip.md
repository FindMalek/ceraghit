# GlitchTip: error tracking next to OpenObserve

OpenObserve answers "what happened and how often" (logs, traces, metrics). GlitchTip answers "what broke, since when, who
should look": grouped errors with a stack trace, first and last seen, regression and spike alerts. Both are optional and
independent: with no DSN the apps run exactly as before. Issue #423, tied to #301.

## what exists in the repo

| piece | where | behaviour |
| :-- | :-- | :-- |
| SDK wiring | `packages/errors` (`@sentry/node`, `@sentry/browser`) | errors only: no tracing, no replay, no http/console/db instrumentation, no OpenTelemetry provider (OpenObserve is untouched) |
| api | `apps/api/src/index.ts`, `server.ts`, `logger.ts` | starts when `GLITCHTIP_DSN` is set and `APP_ENV` is not `local`; reports thrown requests and handler 5xx |
| web, dashboard (server) | `instrumentation.ts` | `register()` starts it, `onRequestError` reports with route, digest and `request_id`. The edge runtime (only the proxy) is not instrumented |
| web, dashboard (browser) | `instrumentation-client.ts`, error boundaries | only when `NEXT_PUBLIC_GLITCHTIP_DSN` was set at **build** time |
| events | `runJob`, `deliverMail`, `settleOrder`, lazy hold sweep, mail purge | tags `job`, `mail_kind`, `attempts`, `order_id`, `order` (number), `provider`, `reason`; never a customer field |
| CSP | `packages/sdk/src/security.ts` | `connect-src` gains the GlitchTip origin only when `NEXT_PUBLIC_GLITCHTIP_DSN` is set and `APP_ENV` is not `local` |

## variables

| variable | who | notes |
| :-- | :-- | :-- |
| `GLITCHTIP_DSN` | api, web, dashboard (server) | project DSN. A normal env var (a DSN is semi-public), never printed by the setup scripts |
| `GLITCHTIP_ENV` | same | `preview` or `production`: which project the DSN belongs to. **Must equal `APP_ENV`**, the api refuses to boot otherwise |
| `NEXT_PUBLIC_GLITCHTIP_DSN` | web, dashboard | the same project's DSN, read by the browser, inlined at build |
| `NEXT_PUBLIC_GLITCHTIP_ENV` | web, dashboard | must equal `APP_ENV` too, checked when the Next server boots |
| `GLITCHTIP_RELEASE` | optional | defaults to `VERCEL_GIT_COMMIT_SHA`, then `GIT_SHA`, then `GITHUB_SHA` |
| `GLITCHTIP_SAMPLE_RATE` | optional | 0 to 1, default 1 (every error) |

The event `environment` tag is `APP_ENV` (`preview` or `production`), the `release` tag is the git sha.

### environments never mix

- one GlitchTip **project per environment**: `ceraghit-preview` and `ceraghit-production`, each with its own DSN;
- `local`, the e2e stack and the demo recorder: no DSN at all, and `APP_ENV=local` never starts the SDK even if a DSN leaks
  into a `.env`;
- a DSN declared `GLITCHTIP_ENV=production` is refused on any other `APP_ENV` (`apps/api/src/env.ts`, `startNextErrors`);
- a DSN must look like `https://<key>@<host>/<numeric project id>`, anything else is refused at boot.

## what is sent, and what never is

`packages/errors/src/scrub.ts` runs in `beforeSend` and `beforeBreadcrumb` on every runtime, and the SDK `dataCollection`
options are off (user info and ip, cookies, headers, bodies, query params, local variables).

- never sent: user and ip, cookies, any header except `user-agent`, `content-type`, `x-request-id`, `accept-language`;
  request bodies; query strings and fragments (token-like path segments become `:id`); local variables; console, typing
  and navigation breadcrumbs; contexts other than os, runtime, browser, device, culture and trace;
- on admin, login, vault, upload, session, onboarding and webhook routes, even `extra` and breadcrumbs are dropped
  (detected from the request url or the `route` tag);
- every string (messages, breadcrumbs, extra at any depth) loses emails, phones, ibans, `Bearer` and `Basic` values,
  `password=`/`"token":"..."` style fields, bound values of a failed database query, user and password in connection urls,
  query strings of urls written inside text, 8 digit local phone numbers, and any 32+ character key-shaped value; keys named like a credential or a
  person's name, email, phone or address are blanked;
- dropped as noise: `NEXT_REDIRECT`, `NEXT_NOT_FOUND`, rate limits, aborted requests, flaky browser networks, anything
  tagged with a 4xx status. 4xx `ORPCError` answers are never reported at all.

The rules are patterns and key names: a name or street written as free text inside an error message is not detected, so
never put customer fields in an error message.

Tests: `packages/errors/test/scrub.test.ts` (realistic payloads), `config.test.ts` (no SDK without a DSN), `apps/api/test/env.test.ts`.

## deploy GlitchTip (operator, once)

Nothing here is run by the repo. The compose file is `deploy/glitchtip/docker-compose.yml` (GlitchTip 6.2.6, Postgres
17.12, Redis 7.4.12, all pinned): `web`, `worker` (celery and beat), `migrate`, `postgres`, `redis`.

1. On the homelab (or as a Dokploy "Compose" app pointing at that file), copy `deploy/glitchtip/.env.example` to `.env` and fill:
   `POSTGRES_PASSWORD`, `SECRET_KEY` (`openssl rand -base64 48`), `GLITCHTIP_DOMAIN` (public https url), `DEFAULT_FROM_EMAIL`,
   `EMAIL_URL` (SMTP, e.g. the same provider that sends the shop mails, a dedicated sender address).
2. `docker compose up -d`. `migrate` runs first and exits. Route the domain through Traefik/Dokploy to the `web` port 8000
   with TLS (drop the `127.0.0.1` port mapping then).
3. Create the first superuser: `docker compose exec web ./manage.py createsuperuser`. Registration and organization
   creation are off in the compose file, so this is the only way in; invite the owner by email afterwards.
4. In the UI: create the organization `ceraghit`, then two projects (platform "Node.js" or "JavaScript"):
   `ceraghit-preview` and `ceraghit-production`. Copy each DSN from Project, Settings, Client Keys. Note which is which.
5. Set the variables (next section). Use the preview DSN everywhere that is not production.
6. Backups: the data is the `pgdata` volume. Nightly `docker compose exec -T postgres pg_dump -U glitchtip -Fc glitchtip > glitchtip-$(date +%F).dump`
   from cron, age-encrypted like `.github/workflows/backup.yml` does, kept off the host. Errors are disposable after 90 days
   (`GLITCHTIP_MAX_EVENT_LIFE_DAYS`), so a weekly dump is enough; the settings (projects, DSNs, alert rules) are what matters.
   Restore: `pg_restore --clean -d glitchtip` into a fresh `postgres`, then `docker compose up -d`.
7. Upgrades: change one image tag, read the GlitchTip release notes, `docker compose pull && docker compose up -d`.

## set the variables

| where | what |
| :-- | :-- |
| Vercel production, projects `ceraghit-api`, `ceraghit-web`, `ceraghit-dashboard` | `GLITCHTIP_DSN` (production DSN), `GLITCHTIP_ENV=production`; on web and dashboard also `NEXT_PUBLIC_GLITCHTIP_DSN` (same DSN) and `NEXT_PUBLIC_GLITCHTIP_ENV=production`, then **redeploy** (the browser values are inlined at build). Easiest: put the four names in `.env.production.local` and run `scripts/vercel-setup.sh` |
| previews and staging (Dokploy) | repository secret `GLITCHTIP_DSN` (the **preview** project DSN). `preview.yml` and `staging.yml` pass it to `scripts/deploy/dokploy.mjs`, which sets `GLITCHTIP_ENV=preview`. Server-side errors only: the preview images are not built with `NEXT_PUBLIC_*`, so the browser SDK stays off there |
| local, e2e, demo | nothing |

After the change, throw one test error on a preview (or call a route that 500s) and check it shows in `ceraghit-preview` within a
minute with `environment: preview`, the right release, no user, no cookies.

## source maps (optional)

Not wired and never mandatory: without them the browser stack traces of the minified bundle are unreadable, the server
ones are fine. To add them later: a CI step after `next build` with `@sentry/cli` (`SENTRY_URL=<glitchtip url>`,
`SENTRY_AUTH_TOKEN`, `SENTRY_ORG=ceraghit`, `SENTRY_PROJECT=ceraghit-production`) running
`sentry-cli sourcemaps inject` and `upload` on `.next/static`, with `--release $GIT_SHA` matching `NEXT_PUBLIC_GLITCHTIP_RELEASE`,
guarded by `if: secrets.SENTRY_AUTH_TOKEN != ''` so a fork or a missing token skips it. Remove the maps from the deployed output after
upload (`productionBrowserSourceMaps` stays off).

## alert rules (GlitchTip UI, per project)

In each project, Alerts:

| rule | setting | route |
| :-- | :-- | :-- |
| new issue | "A new issue is created", production only | email to the operator and the owner |
| regression | "An issue changes state from resolved to unresolved" | same |
| spike | "Number of events in an issue is more than 20 in 5 minutes" (tune after a week) | same, plus a Slack/webhook recipient (GlitchTip supports webhook and Slack-compatible recipients) if the operator wants a push |

Mail needs the SMTP settings above; send one test alert from the UI. The preview project gets no alerts (or a muted
operator-only rule).

## how it ties to OpenObserve

- every GlitchTip event carries tags `request_id` and `trace_id`, the same fields as the OpenObserve log line. From an issue:
  search the logs stream `ceraghit` for `request_id = '<tag>'` (or open the trace by `trace_id`); the api also logs
  `glitchtip_event_id` on its `request failed` and `procedure failed` lines, so the other way round works too;
- OpenObserve keeps the volume view: dashboard `Ceraghit` panels "Requests by status class" (api error rate) and "p95 latency per
  route" (`http.server.duration`), the alerts `ceraghit-api-error-logs`, `ceraghit-mail-failures`, `ceraghit-payment-mismatch`,
  `ceraghit-cron-missed`. They stay: GlitchTip has no metric alerts. Rule of thumb: OpenObserve pages on rates and silence
  (cron missed, error rate up), GlitchTip pages on a new kind of failure;
- the same incident usually fires both. The runbook says look at GlitchTip first for the stack, then OpenObserve for the context.

## steps for the owner and operator, in order

1. Deploy the compose file (section "deploy GlitchTip"), create the superuser, organization and the two projects.
2. Put the preview DSN in the repository secret `GLITCHTIP_DSN`; open or update a PR and check the event arrives in `ceraghit-preview`.
3. Fill the four `GLITCHTIP_*` / `NEXT_PUBLIC_GLITCHTIP_*` values for production in `.env.production.local`, run `scripts/vercel-setup.sh`, redeploy the three apps.
4. Create the alert rules and send a test mail.
5. Optional: source maps CI step.
