# Testing

## Unit tests

`pnpm test` runs `bun test` per package. Tests live in a `test/` folder of the package they cover, named `<file>.test.ts`.

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
- Demo payments live in the api's memory: never restart the api mid-run.
- Seeded pending online orders auto-cancel when opened: a spec creates its own orders.
- iPhone 14 runs webkit, so fonts and `-webkit-text-stroke` differ from chromium.

### Screenshots

Every `step()` leaves `test/e2e/artifacts/screenshots/<project>/<spec>/<test>/<NN>-<step>.png`. Upload a folder to a
PR with `pnpm pr:screenshots`. The HTML report is in `test/e2e/artifacts/report`, traces and videos of failures in
`test/e2e/artifacts/test-results`. `artifacts/` is gitignored.

### In CI

The `e2e` job in `.github/workflows/ci.yml` runs the whole suite on every PR and on `main`, in parallel with `lint`,
`types`, `test` and `build`. It uploads `test/e2e/artifacts/` as the artifact `e2e-artifacts` (screenshots, report,
`results.json`, traces and videos of failures; 14 days) and writes totals per project and the flaky tests to the job
summary. Browsers are cached on the Playwright version.

Screenshots of a run for a PR body:

```bash
gh run download <run-id> -n e2e-artifacts -D /tmp/e2e-<pr>
pnpm pr:screenshots /tmp/e2e-<pr>/screenshots
```

### Writing a spec

- One file per feature: `test/e2e/specs/<feature>.e2e.ts`. Import `test` and `expect` from `../fixtures`.
- Wrap every user-visible step in `step(title, fn)`, so a screenshot exists even when the test passes.
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
