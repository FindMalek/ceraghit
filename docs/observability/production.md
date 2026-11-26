# production wiring: logs, backups, uptime

What exists in the repo, what was observed on 2026-11-22 (read-only: `gh` and `curl`, production untouched), and what the
owner or operator still has to configure. Variable names and metric catalogue: `docs/observability/README.md`; workflow
details: `docs/deploy.md` ("uptime and backups"). Nothing below is run by an agent: it is credentials and console work.

## status

| item | exists in the repo | observed in production | to do |
| :-- | :-- | :-- | :-- |
| uptime probe | `.github/workflows/uptime.yml`, every 30 min, api `/health` (`env:production`, `db:true`), storefront `/` and `/shop`, dashboard `/login`, certificate expiry over 14 days, opens and closes a `production down` issue | scheduled runs green (latest runs success); no incident issue ever opened | run it once against a wrong host to see the issue open and close (see below) |
| `/health` | api route, `Cache-Control: no-store` | `{"ok":true,"db":true,"payments":"demo:test","shipping":"manual:production","onlinePayments":false,"env":"production"}` | none |
| database backup | `.github/workflows/backup.yml`, Sundays 02:30 UTC: `pg_dump` custom format, `age` encrypted, to `ceraghit-backup/db/YYYY-MM-DD.dump.age` | **not working**: the only run (2026-11-22) failed at "Dump and encrypt the database", `age: unknown recipient type ""`, because `BACKUP_AGE_RECIPIENT` is not set | create the age key pair, set the variable and the `BACKUP_*` secrets, run once |
| media backup | same workflow: `rclone sync` of `ceraghit-prod` to `ceraghit-backup/media`, deletions moved to `media-deleted/<date>/` | never ran past the dump step | same as above |
| Neon point-in-time restore | none (a Neon feature) | not checked | owner or operator confirms the retention window of the plan in the Neon console |
| R2 versioning | none | not checked | decide: the media sync already keeps deleted files 90 days; versioning on `ceraghit-prod` is optional |
| OpenObserve export | `apps/*/instrumentation.ts`, dashboard `dashboard.json`, alerts `alerts.json` | the `production` GitHub environment has no `OPENOBSERVE_*` (they belong to the Vercel projects, not checked here) | see "OpenObserve" |
| GlitchTip error tracking | `packages/errors`, `docs/observability/glitchtip.md` (#423) | shared instance, both projects and DSNs set | create the alert rules (see `glitchtip.md`, last section) |
| alert routes | alerts target the `owner-mail` destination | not verified | create the destination, import the alerts |
| scheduler | `apps/jobs` on Trigger.dev | schedules active (#302) | see `docs/jobs.md` |

A failed weekly backup alerts nobody (the uptime workflow only watches the live site). Until that is fixed, the operator
checks the Backup run in the Actions tab every Monday, or sets a GitHub notification for failed workflow runs.

## OpenObserve (what the operator configures)

1. On `https://o2.findmalek.engineer`, create an ingest-only service account `ceraghit-production`, separate from the preview one.
2. On the three Vercel projects, Production: `OPENOBSERVE_URL`, `OPENOBSERVE_ORG=default`, `OPENOBSERVE_USER`,
   `OPENOBSERVE_PASSWORD`, optional `OPENOBSERVE_STREAM=ceraghit`, `LOG_LEVEL=info`. Mark the password sensitive. Redeploy.
3. For previews and staging, repository variables `OPENOBSERVE_URL`, `OPENOBSERVE_ORG`, `OPENOBSERVE_STREAM` and secrets
   `OPENOBSERVE_USER`, `OPENOBSERVE_PASSWORD` (the `ceraghit-preview` account).
4. Import `docs/observability/dashboard.json` and `alerts.json`; create the `owner-mail` destination first (alerts reference it).
5. Verify with one real checkout on production (cash on delivery, cancelled afterwards): one trace `ceraghit-web` to
   `ceraghit-api`, logs with the same `trace_id`, and `ceraghit.orders.created` in metrics. Search the exported logs for an
   email, a phone, an IBAN and `Bearer`: none may appear.

## GlitchTip (what the operator configures)

Errors with a stack trace, new-issue/regression/spike mails. Optional and independent of OpenObserve; the full setup, privacy
rules and variable table are in `docs/observability/glitchtip.md`. Summary: projects `ceraghit-preview` and
`ceraghit-production` on https://errors.findmalek.engineer (never a second instance), `GLITCHTIP_DSN` + `GLITCHTIP_ENV=production` (and the `NEXT_PUBLIC_`
pair on web and dashboard) on the Vercel projects, redeploy. A production DSN is refused on any other `APP_ENV`. Check after the
first real error that the event has no email, phone, cookie or request body.

## backups (what the owner or operator configures)

1. On a trusted machine: `age-keygen -o ceraghit-backup.key`. The private key stays offline (password manager and a printed copy
   with the owner); only the public key (`age1...`) goes online.
2. GitHub `production` environment, variable `BACKUP_AGE_RECIPIENT` (the public key), optional `BACKUP_S3_BUCKET`.
3. GitHub `production` secrets: `BACKUP_S3_ENDPOINT`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` (a token scoped to
   `ceraghit-backup` only) and the source `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (read access to `ceraghit-prod`).
   Create the `ceraghit-backup` bucket first.
4. Run Actions, Backup, "Run workflow". Confirm `db/<today>.dump.age` and the `media/` tree exist in the bucket.
5. Restore drill, once, then repeat every quarter: download the dump, `age -d -i ceraghit-backup.key <file> > db.dump`, create a
   Neon branch, `pg_restore --no-owner -d <branch-url> db.dump`, count `orders`, `products` and media rows against production,
   delete the branch. Write the date at the bottom of this file.
6. Neon: note the restore window of the current plan, and the exact steps to restore to a point in time (create a branch from
   a timestamp, check it, repoint `DATABASE_URL`), in the runbook.

Last restore drill: never done.

## uptime and alert routes

- Run Actions, Uptime, "Run workflow" with a wrong api host once to see the `production down` issue open, then rerun with the right
  one to see it close (the workflow takes its hosts from the `production` variables, so use a branch or a temporary variable).
- GitHub emails the issue and failed workflow runs to repository watchers: make sure the operator and the owner watch the repo
  for "Issues" and "Actions". That is the only alert route for uptime today.
- Alert routes to decide: OpenObserve `owner-mail` (mail on error logs), and optionally a push channel on the operator's phone.
  Whatever is chosen, the owner must receive the "site down" message, not only the operator.

## CRON_SECRET

The production `CRON_SECRET` was rotated (#301). It lives in Vercel api production, the GitHub `production` secret and Trigger.dev
`prod`. When rotated again: `docs/runbook.md` ("secrets rotation"); update staging and local copies by hand.
