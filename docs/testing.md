# Testing

## Unit tests

`pnpm test` runs `bun test` per package. Tests live in a `test/` folder of the package they cover, named `<file>.test.ts`.

Turbo runs every package's tests at once against one `DATABASE_URL`. `packages/db`, `packages/orpc` and `apps/api` each
preload `packages/db/src/test-setup.ts` (`bunfig.toml`), which points the package at its own database
(`<name>_<package>`, e.g. `ceraghit_test_orpc`), created on demand under an advisory lock; the role needs `CREATEDB`
(local dev and the CI service container are superusers). The preload throws when `APP_ENV` is `production` or `preview`. A test that asserts on a global table (`integration_credentials`,
`settings`) filters to its own rows, and a file removes what it saved: bun walks test files in filesystem order, which
differs between machines, so a leftover row from one file fails another only on some runners.

## End to end (Playwright)

The harness is the workspace package `test/e2e` (`@workspace/e2e`). It runs the real apps against a throwaway
database seeded with the demo data, on six projects: `desktop-fr|en|ar` (1440x900, chromium) and `mobile-fr|en|ar`
(iPhone 14, webkit). `pnpm test` does not run it: specs are `*.e2e.ts` and the package has no `test` script.

```sh
pnpm build            # web and dashboard are started from their build
pnpm e2e:install      # once: chromium and webkit
pnpm e2e              # all projects
pnpm e2e -- --project=desktop-fr
pnpm --filter @workspace/e2e e2e:ui
```

Docker must be running. `pnpm e2e` first runs `test/e2e/scripts/prepare.ts`: it resets the compose project
`ceraghit-e2e` (postgres on 5436, S3 on 9100, Mailpit on 8025, no volumes), migrates, seeds the demo and creates the
bucket. Playwright then starts the api (3001), the storefront (3000) and the dashboard (3100). The dev database on
5435 is never touched.

- The apps are started with `next start`. It prints a warning about `output: standalone` and works anyway.
- Ports are free by default; prepare fails if 3000, 3001 or 3100 are taken. `E2E_REUSE=1` tests the apps that are
  already running instead, `E2E_SKIP_PREPARE=1` keeps the current database. Every port can be changed with
  `E2E_WEB_PORT`, `E2E_DASHBOARD_PORT`, `E2E_API_PORT`, `E2E_DB_PORT`, `E2E_S3_PORT`, `E2E_MAILPIT_UI_PORT`,
  `E2E_MAILPIT_SMTP_PORT` and `E2E_COMPOSE_PROJECT` (must start with `ceraghit-e2e`, it is torn down with `-v`; see `test/e2e/env.ts`).
- Konnect and Groq are never called for real: the stack starts a stand-in (`support/stubs/server.ts`, port
  `E2E_STUB_PORT`, 9300) and the api reaches it through `KONNECT_BASE_URL` and `GROQ_BASE_URL`. Both are refused in
  production by `apps/api/src/env.ts`, like `ARAMEX_FAKE`. Specs steer it with `support/stubs.ts` (Konnect pay page with
  Pay / Payment failed / Cancel, `setKonnectPayment`; `setGroqMode` for `ok`, `rate_limit`, `down`, `malformed`,
  `too_long`, `hang`). Konnect keys saved in the dashboard (stub key `e2e-konnect-key`) switch checkout from the demo
  gateway to the stub, so those specs live in `specs/dashboard/` and remove the keys when done.
- Demo payments live in the api's memory: never restart the api mid-run.
- The api's stdout and stderr go to `test/e2e/artifacts/api.log` (`E2E.apiLog`), so a spec can scan it for leaks.
- Seeded pending online orders auto-cancel when opened: a spec creates its own orders.
- iPhone 14 runs webkit, so fonts and `-webkit-text-stroke` differ from chromium.

### Screenshots

Every `step()` leaves `test/e2e/artifacts/screenshots/<project>/<spec>/<test>/<NN>-<step>.png`. Upload a folder to a
PR with `pnpm pr:screenshots`. The HTML report is in `test/e2e/artifacts/report`, traces and videos of failures in
`test/e2e/artifacts/test-results`. `artifacts/` is gitignored.

### In CI

`ci.yml` calls `.github/workflows/e2e-shards.yml` on every PR and on `main`, in parallel with `lint`, `types`, `test` and
`build`. Every job owns a runner, so each has its own Postgres, Garage and Mailpit on the default ports:

- `storefront (1..4/4)`: `pnpm e2e --project=setup`, then the `desktop-*` and `mobile-*` projects with
  `--no-deps --shard=i/4`.
- `dashboard chain`: `E2E_SUITE=dashboard`, the serial `dashboard-*` then `journeys-*` projects, alone on their stack.
- `report`: merges the blob reports into one HTML report and writes totals per project and the flaky tests to the job
  summary.
- `e2e` (in `ci.yml`): the single gate, green only when every shard is. Require this one.

Why by hand: Playwright runs a project's dependencies and never splits a dependency graph across shards, so a plain
`--shard` on the full config runs everything in shard 1 and nothing in the others. Shards are cut by project and file
(`fullyParallel: false`), only with `--no-deps`, after `setup` has run. If a shard is much slower than the others, change
the shard count in `e2e-shards.yml`.

Artifacts (14 days): `e2e-artifacts-<job>` (screenshots, traces and videos of failures, `results.json`), `e2e-report`
(merged HTML report and `results.json`). `.github/workflows/e2e-nightly.yml` runs the same suite every night at 02:00 UTC
and on demand; a red night opens one `nightly e2e failed` issue and comments on it the next nights.

Screenshots of a run for a PR body:

```bash
gh run download <run-id> -p 'e2e-artifacts-*' -D /tmp/e2e-<pr>
pnpm pr:screenshots /tmp/e2e-<pr>/e2e-artifacts-storefront-1/screenshots
```

### Writing a spec

- One file per feature: `test/e2e/specs/<feature>.e2e.ts`. Import `test` and `expect` from `../fixtures`.
- Wrap every user-visible step in `step(title, fn)`, so a screenshot exists even when the test passes.
- Specs that sign in to the dashboard or change shop-wide state go in `test/e2e/specs/dashboard/`: they are discovered
  by file name (no list to edit), run one at a time after the storefront specs, `auth` and `onboarding` first, then
  alphabetically.
- Select by role, label or accessible name, never by CSS class. Copy comes from `helpers/messages.ts` (`t(locale, key)`),
  not from string literals.
- Never `waitForTimeout`: wait for a URL, a role or a text.
- Get data through helpers: `placeOrder` (browser), `createOrderViaApi`, `payDemo`, `ownerPage` (signed-in dashboard),
  `home("/shop")` (storefront path in the project locale), Mailpit helpers from `support/mailpit.ts`.
- A test that only makes sense in one locale or on desktop gets the tag `@fr` or `@desktop`. Those projects are
  filtered in `playwright.config.ts`; do not use `test.skip`.
- A new state a spec needs goes in `packages/db/src/seed/scenario.ts`, in that spec's issue.

### Flaky policy

A test that passes only on retry is a bug in the product or in the test and is fixed in the same lane. No `test.skip`
or `test.fixme` without an open issue number in the reason. Nothing is quarantined at delivery. A test listed as flaky in
the CI job summary is fixed before the PR merges.
