# apps/jobs

Trigger.dev schedules, nothing else. One `schedules.task` per job in `packages/sdk/src/jobs.ts` whose handler is
registered in `apps/api/src/cron.ts`; a task only calls `POST /cron/<name>` on the api, so the api keeps the job body,
the advisory lock and the `job_runs` row. Never add a task before its endpoint exists: it gets a 404 and aborts.

- Self-hosted instance on the-keep: https://trigger.findmalek.engineer, version `4.7.3`. The CLI here is pinned to that
  version (`trigger.dev` and `@trigger.dev/sdk` in `package.json`); upgrade it together with the stack, never alone.
- Env per Trigger.dev environment is `CERAGHIT_API_URL` and `CRON_SECRET`, set in the Trigger webapp. No database, no
  bucket, no mail or payment key ever lives here.
- `trigger.config.ts` uses `TRIGGER_PROJECT_REF` (repository variable); `jobs.yml` deploys `--env prod` on a merge to
  `main` with a personal access token (`TRIGGER_ACCESS_TOKEN`), not an environment secret key.
- Schedules are `Africa/Tunis` and come from the catalogue; the run log holds counts only (the api never returns
  customer data).
