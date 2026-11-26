# release

The exact sequence to take the shop from "deployed" to "taking real orders". Read it with
`docs/runbook.md` (rollback, rotation) and `docs/deploy.md` (workflows).

State when this was written (2026-11-22, read from the live endpoints and `gh`, nothing changed):

| item | state |
| :-- | :-- |
| `DEPLOY_ENABLED` | `true`: every merge to `main` already deploys to production |
| `https://api.ceraghit.com/health` | `ok`, `db: true`, `env: production`, `payments: demo:test`, `shipping: manual:production`, `onlinePayments: false` |
| `ceraghit.com`, `dashboard.ceraghit.com/login` | 200; `www.ceraghit.com` answers 308 |
| `cdn.ceraghit.com` | serves CORS for the dashboard origin |
| card payments | off (`ONLINE_PAYMENTS=false`), no card gateway integrated |
| shipping | manual, no Aramex credentials |
| GitHub `production` environment | has Vercel, Neon, `CRON_SECRET`, admin login; no `BACKUP_*`, no `BACKUP_AGE_RECIPIENT`, no `OPENOBSERVE_*` |
| GitHub release `v1.0.0` | does not exist |

So there is no big-bang switch left: the release is a series of owner-driven switches, each reversible. Order matters.

## 0. Before anything

- [ ] every issue of the delivery is closed or consciously deferred; the open ones that remain are client dependent (#7, #8, #14, #20, #102)
- [ ] latest `main` Deploy run green, `curl -s https://api.ceraghit.com/health` as above
- [ ] backups and uptime wired (`docs/observability/production.md`): a release without a restorable database is not a release
- [ ] `docs/handover.md` read with the owner, the operator contact filled in

## 1. Keys and secrets (owner and operator)

- [ ] Vercel production env names match `docs/production.env.example` on the three projects (names only: `vercel env ls production --scope <team>`)
- [ ] `MAIL_REDIRECT_TO` absent, `SECRETS_KEY` set on the api only and a copy in the password manager, `PROXY_SECRET` identical on the three projects, `TRUSTED_PROXY_HOPS=1` on the api
- [ ] `RESEND_API_KEY` set, `commandes@ceraghit.com` verified (SPF, DKIM green; DMARC `v=DMARC1; p=none; rua=...` first, tighten later)
- [ ] R2 credentials scoped to `ceraghit-prod`; `S3_PUBLIC_URL=https://cdn.ceraghit.com`
- [ ] owner password: set `ADMIN_PASSWORD`, run Deploy, hand it over in person (see `docs/runbook.md`)
- [ ] catalogue loaded with the studio's real prices, stock and texts (#7); `DATABASE_URL=<neon> pnpm db:seed:catalog` once, then the owner edits in the dashboard

## 2. Domains and CORS

- [ ] Vercel domains: `ceraghit.com` (web), `www` redirect to the apex, `dashboard.`, `api.`; Cloudflare records DNS only
- [ ] `cdn.ceraghit.com` attached to the R2 bucket; both CORS rules of `docs/deploy.md` present:
  `curl -sI -H "Origin: https://dashboard.ceraghit.com" https://cdn.ceraghit.com/<key>` returns `access-control-allow-origin`
- [ ] `http://` redirects to `https://`; HSTS present on the three hosts
- [ ] old site URLs from the client, if any, redirected: `apps/web/next.config.ts` has no `redirects()` yet, so add a `redirects()` block there (or extend `apps/web/proxy.ts`, which already does the `www` 308)

## 3. Card payments

None: no gateway is integrated and the api refuses `ONLINE_PAYMENTS=true` in production (`docs/payments.md`).

## 4. Aramex live switch (needs the client's contract and keys, #198)

1. [ ] sandbox checklist of `docs/aramex.md` done with test credentials; the "guessed values" confirmed and fixed in the one place that holds them
2. [ ] the rep's answers received (`docs/aramex.md`, "Questions for the Aramex rep")
3. [ ] owner enters the production credentials on "Livraison", "Tester la connexion" passes
4. [ ] `productTypes`, `labelReportId`, `paymentType`, `deliveredCodes` set explicitly; the product-types confirmation switch on; mode réel on
5. [ ] `/health` says `shipping: aramex:production`; one real label created, printed, then the pickup booked and cancelled
6. [ ] `track-shipments` job run is green in "Réglages"

Rollback: set "Livraison" back to Manuel.

## 5. Smoke tests

Run after every step above that changed production, read-only, no order created:

```sh
curl -s https://api.ceraghit.com/health
curl -sI https://www.ceraghit.com | head -1          # 308
curl -s https://ceraghit.com/robots.txt | head -5    # allows
curl -s https://ceraghit.com/sitemap.xml | grep -c '<loc>'
curl -sI https://dashboard.ceraghit.com/login | grep -i 'x-robots-tag'
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'content-type: application/json' -H 'x-csrf-token: orpc' -d '{}' https://api.ceraghit.com/rpc/admin/overview   # 401 for a visitor (without the csrf header: 403)
```

Then by hand: the storefront in fr, en and ar, one product page, the legal pages (no `[` placeholder left), the dashboard login
on a phone, and the acceptance checklist `docs/acceptance.md`. A scripted `smoke:production` command is not written yet; the
`smoke` job of `deploy.yml` covers `/health`, the storefront and the dashboard login only.

## 6. First 24 hours

- [ ] `uptime.yml` green, no `production down` issue
- [ ] OpenObserve shows traffic and no error logs
- [ ] `cleanup-uploads` and `release-holds` ran (Trigger.dev, "Réglages" job table)
- [ ] Resend shows deliveries, one real mail landed in the inbox, not spam
- [ ] the owner places a harmless test order in cash on delivery, then cancels it (`docs/acceptance.md`)
- [ ] Google Search Console: the owner adds the property and submits `sitemap.xml`

## 7. Rollback

Same as `docs/runbook.md` ("rollback"): app problem, Vercel Instant Rollback per project (migrations are additive so the
old code still runs); data problem, Neon point-in-time restore to a branch; feature problem, switch it off in the dashboard
or `ONLINE_PAYMENTS=false`; leaked secret, rotate. A failed `migrate` job stops the deploy before Vercel: fix forward.

## 8. Release notes

Draft a GitHub release `v1.0.0` (the operator publishes it) with the merged PR list
(`gh pr list --state merged --json number,title`) and the known limits at that date: no card payment,
Aramex pending credentials (#198), Payoneer manual, backups and OpenObserve wiring (#301) if still open.
