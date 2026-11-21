# PR process (agents)

One issue, one worktree, one PR. Squash-merged only when every condition at the end holds.

## Start

1. `wt new <issue>`: worktree off the latest `origin/main` on the issue's branch (what `gh issue develop <n>` makes). Work
   only in the path it prints, never in the main checkout.
2. `kb context <paths you will touch>` before planning or editing.

## Before opening the PR

- `pnpm check`, `pnpm lint`, `pnpm check-types`, `pnpm test` for the touched packages, the relevant e2e specs.
- Screenshots of every flow you tested: desktop (1440x900) and mobile (390x844), fr/en/ar when any text changed. Non-UI
  work: the command or test output, API responses, DB state. Show the failure cases you tried, not only the happy path.
- The repo is public, so are the screenshots: demo data only, no tokens or keys, no real customer names, emails or
  addresses, no dashboard page that shows a secret.

## Upload screenshots

```sh
pnpm pr:screenshots                     # test/e2e/artifacts/screenshots
pnpm pr:screenshots shots/ --key 128    # any folder, explicit key
pnpm pr:screenshots shots/ --dry-run    # print the markdown, no git writes
```

From CI: `gh run download <run-id> -p 'e2e-artifacts-*' -D e2e` then `pnpm pr:screenshots e2e/e2e-artifacts-<job>/screenshots`.

The script commits the images to the orphan branch `pr-assets` under `<key>/` (key = the branch's PR number, else the
branch name) without touching your checkout, retries when another agent pushed at the same time, and prints markdown
like `![home desktop](https://github.com/FindMalek/ceraghit/blob/pr-assets/128/home-desktop.png?raw=true)`. Paste it
under `## Screenshots` with one caption line per image saying what was tested and the result.

`pr-assets` is never merged into `main` and never cleaned up by agents.

## PR body

Fill every template section (`.github/pull_request_template.md`): `Closes #<n>`, what changed, how it was tested,
screenshots, migration. The `pr-body` check fails when `Closes #n` is missing, there is no inline image, the
Screenshots section only holds the template comment, or a `pr-assets` image was never pushed. Editing the body re-runs it.

## Migrations

- Only one open PR may carry a migration. Before `pnpm db:generate`, check the open PRs
  (`gh pr list`, then `gh pr diff <n> --name-only` for `packages/db/drizzle/`); if one has a migration, wait and rebase.
- Additive only: production migrates on merge, the running code must keep working against the new schema.

## Commits

`type(scope): subject`, subject at most 5 words, lowercase. Existing git identity, never `--author` or `GIT_AUTHOR_*`.
No AI attribution anywhere (`commit-lint.yml` checks commits and PR text). Run `git log -1 --format=%B` before every push.

## Review and merge

- CI green, then read every review comment (CodeRabbit, bots, humans). Fix the valid ones, reply in the thread, resolve it.
  Wrong comments get a reply with the reason, then resolve.
- Merge only when CI is green, every thread is resolved, the review agent's last comment says LGTM and the body has the
  screenshots: `gh pr merge <n> --squash --subject "<PR title> (#<n>)" --body ""`.
- If GitHub demands a formal approval, stop and report. Never bypass protections.
