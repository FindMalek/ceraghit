# scheduled jobs: Trigger.dev operations

The scheduler is the Trigger.dev project `ceraghit` on `https://trigger.findmalek.engineer` (code in `apps/jobs`, deployed by
`.github/workflows/jobs.yml`). The job list, schedules and stale thresholds are in `docs/deploy.md` ("scheduled jobs"); this
page is what the operator does around them: rotate the deploy token, add a staging environment, retire the GitHub cron.
All of it is console work on the Trigger.dev instance and in GitHub settings; no secret is ever committed.

State on 2026-11-22 (read-only `gh`): `jobs.yml` last ran green on 2026-11-21; the GitHub `cleanup-uploads.yml` cron also still
runs daily and is green, so the cleanup currently has two schedulers (harmless, it is idempotent, but it is meant to be one).
`TRIGGER_ACCESS_TOKEN` is stored as a repository secret (the `production` environment lists none, and the job reads it
through `environment: production`, which falls back to the repository secret).

## rotate the deploy token

`TRIGGER_ACCESS_TOKEN` is a personal access token that `jobs.yml` uses for `trigger deploy --env prod`. The current one,
`ceraghit-deploy`, was created straight in the Trigger.dev database to bootstrap the project and must be replaced by one made
in the UI.

1. Log in to `https://trigger.findmalek.engineer` as the operator, Account, Tokens, create a token named `ceraghit-deploy-<yyyy-mm>`.
2. Put it in GitHub: Settings, Secrets and variables, Actions, secret `TRIGGER_ACCESS_TOKEN` (or the `production` environment
   secret, which then wins). Paste it once, never in a chat or a file.
3. Run Actions, Deploy jobs, "Run workflow" on `main`. It must go green (it deploys `--env prod`).
4. Back in Trigger.dev, revoke the old `ceraghit-deploy` token.
5. Check the next scheduled run in the Trigger.dev dashboard and the `job_runs` table in "Réglages".

Rotate again whenever the operator changes, after any leak, and once a year. If the deploy fails after step 2, the old token is
still valid: fix the secret before revoking.

## staging environment (plan)

The project only has `prod`. Staging schedules are optional because staging is a hand-run demo environment on the-keep.
If they are wanted:

1. In the Trigger.dev webapp, add a `staging` environment to the project.
2. Set exactly two variables on it: `CERAGHIT_API_URL=https://api.ceraghit.findmalek.engineer` and a **different**,
   staging-only `CRON_SECRET` (the same value must be on the staging api).
3. Add a second deploy step to `jobs.yml` (or a manual workflow) running `trigger deploy --env staging`. `trigger.dev` and
   `@trigger.dev/sdk` stay pinned to the server version (`4.7.3`), upgraded with the stack, never alone.
4. Run each task once from the Trigger.dev dashboard and check the `job_runs` rows on the staging dashboard.

Never give the homelab database, bucket, mail, payment or vault credentials: a task only calls the api.

## remove the GitHub cron

One scheduler at a time. After about a day of green `cleanup-uploads` runs from Trigger.dev (check the run list for
`cleanup-uploads` at 03:15 Africa/Tunis and "Réglages", job table, last run under 26 h):

1. Delete `.github/workflows/cleanup-uploads.yml` in a follow-up PR (docs line "`cleanup-uploads.yml`" in `docs/deploy.md` and
   the README mention go with it; `cleanup-dev-bucket.yml` is a different job and stays).
2. Merge, then confirm the next morning that the schedule still ran and the "Réglages" row is not stale.

Fallback if Trigger.dev is down for long: `docs/deploy.md` describes the Vercel Cron option; never enable it alongside Trigger.dev.

## after a Lyterion upgrade

The CLI and SDK in `apps/jobs/package.json` are pinned to the server version. When the Lyterion stack upgrades Trigger.dev,
bump both pins in one PR, run Deploy jobs, and run each task once. Confirm the Trigger.dev project is in the upgrade notes of
that stack.
