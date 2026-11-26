# observability

All three apps ship traces, logs and business metrics to OpenObserve (`https://o2.findmalek.engineer`, org `default`),
over OTLP/HTTP with basic auth. Names and endpoints follow the owner's other projects, so the habit carries over:

| variable | default | who | notes |
| :-- | :-- | :-- | :-- |
| `OPENOBSERVE_URL` | unset | api, web, dashboard | e.g. `https://o2.findmalek.engineer`. Unset = nothing is exported, no socket is opened |
| `OPENOBSERVE_ORG` | `default` | api, web, dashboard | |
| `OPENOBSERVE_USER` | unset | api, web, dashboard | ingest-only service account, one per environment |
| `OPENOBSERVE_PASSWORD` | unset | api, web, dashboard | |
| `OPENOBSERVE_STREAM` | `ceraghit` | api, web, dashboard | log stream, sent as the `stream-name` header |
| `LOG_LEVEL` | `info` | api, web, dashboard | `debug` locally when the request line of `/health` gets noisy |
| `DEPLOY_ENV` | `local` | api, web, dashboard | becomes `deployment.environment`: `local`, `pr-<n>`, `staging`, `production` |

Endpoints derived from the url: `${url}/api/${org}/v1/{traces,logs,metrics}`, header `Authorization: Basic base64(user:password)`.

Grouped error tracking with stack traces and alerts lives in GlitchTip, see `docs/observability/glitchtip.md`; the two share
`request_id` and `trace_id`.

## what lands in OpenObserve

| signal | service names | where it comes from |
| :-- | :-- | :-- |
| traces | `ceraghit-api`, `ceraghit-web`, `ceraghit-dashboard` | one server span per request, one span per oRPC procedure (`orpc.public.orders.create`), one per outbound call (`payments.init`, `payments.get`, `email.send`, `s3.*`, `ai.translate`, `aramex.*`) |
| logs | same three | one JSON line per log call, with `trace_id`, `span_id` and `request_id`; `console.*` goes through the same logger |
| metrics | `ceraghit-api` | see below |

A storefront click is one trace: the Next route handler span (`ceraghit-web`), its `fetch` to `/api/rpc/...`, then the
api's server span and the procedure span (`ceraghit-api`). `packages/sdk/src/proxy.ts` forwards `x-request-id` and the
W3C `traceparent` of the active Next span.

### metrics (`ceraghit.*`)

| metric | type | attributes |
| :-- | :-- | :-- |
| `ceraghit.orders.created` | counter | `method`, `currency`, `country` |
| `ceraghit.orders.paid` | counter | `method`, `currency`, `source` (`gateway`, `manual`) |
| `ceraghit.orders.amount_paid` | counter (minor units) | `currency` |
| `ceraghit.payments.settle` | counter | `result` (`paid`, `pending`, `failed`, `mismatch`, `error`) |
| `ceraghit.emails.sent` / `ceraghit.emails.failed` | counter | `kind`, `locale` when the caller knows it |
| `ceraghit.cron.runs` | counter | `job`, `result` (`ok`, `failed`, `skipped`) |
| `ceraghit.cron.duration_ms` | histogram | `job`, `result` |
| `ceraghit.uploads.deleted` | counter | — |
| `ceraghit.storage.bytes` | observable gauge | — |
| `ceraghit.ai.requests` | counter | `model`, `result` (`ok`, `length`, `error`) |
| `ceraghit.ai.tokens` | counter | `model` |
| `ceraghit.ratelimit.blocked` | counter | `bucket` (`login`, `orders`, `requests`) |
| `http.server.duration` | histogram (ms) | `route` (template), `status_class` |

Never an order number, an email or a raw path in an attribute: `route` is `/v1/orders/:id`, never the order number.
`ceraghit.orders.amount_paid` is minor units, so a panel must split by `currency` before summing TND and EUR.

## set it up (owner, once per environment)

1. In OpenObserve, create one **ingest-only** service account per environment (`ceraghit-production`,
   `ceraghit-preview`) with the `ingest` role on org `default`. Never reuse the production account for previews.
2. Put the five values where the apps read them:
   - production: `docs/production.env.example` → `scripts/vercel-setup.sh` pushes them to the three Vercel projects;
   - previews and staging: repo variables `OPENOBSERVE_URL`, `OPENOBSERVE_ORG`, `OPENOBSERVE_STREAM` and secrets
     `OPENOBSERVE_USER`, `OPENOBSERVE_PASSWORD`, read by `.github/workflows/preview.yml` and `staging.yml` and passed
     to `scripts/deploy/dokploy.mjs`.
3. Import `dashboard.json` (Dashboards → Import) and `alerts.json` (Alerts → Import), then point every alert at the
   owner's email destination. Both files are plain export shapes: adjust the panel ids the UI assigns on import.
4. Open one preview and one production checkout, and check Traces shows `ceraghit-web` → `ceraghit-api` in one trace.

## alerts

| alert | condition | window |
| :-- | :-- | :-- |
| api error logs | any log with `level = 'error'` and `deployment.environment = 'production'` | 5 min, any hit |
| mail failures | `sum(ceraghit_emails_failed)` > 0 for a `kind` | 15 min |
| payment mismatch | `sum(ceraghit_payments_settle{result="mismatch"})` > 0 | 5 min |
| cron missed | no `ceraghit_cron_runs` for a job in 26 h | 26 h |

`alerts.json` targets a single destination named `owner-mail`: create it first (Alerts → Destinations → Email) with the
owner's address, then import.

## no PII, no secrets

`packages/logger` redacts before anything is written: keys matching `email`, `phone`, `address`, `name`, `password`,
`token`, `secret`, `*key`, `authorization`, `cookie`, `iban`, `rib`, `bic`, `payUrl` are replaced by `[redacted]`
(nested too), and an address written inside a message keeps its domain only (`***@example.com`). Order numbers, amounts,
currencies, statuses and country codes are kept: the dashboards need them.

The api also stops one thing before it reaches the log: the request line of the bun server, which is `console.*` that
`patchConsole` rewrites.

## costs and failure modes

- Nothing is exported while the five variables are unset (local default, tests, `bun test`): the meter and tracer are
  no-ops. `apps/api/test/telemetry.test.ts` guards that.
- Exporters are batched: logs every 5 s, metrics every 60 s, traces on a 5 s batch. In Docker the process stays alive,
  so batches leave on their own; on Vercel each request flushes what it produced (`waitUntil`).
- Telemetry never blocks a boot: a missing or wrong `OPENOBSERVE_*` means a single warning line in production, not a
  crash. A dead collector loses the batch, never the request.
