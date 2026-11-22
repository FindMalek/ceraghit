# repo settings

Branch protection and merge settings of `FindMalek/ceraghit`: what is set today and what to set. Read-only report, read on
2026-11-22 with `gh api` (nothing was changed). The owner applies what he wants; agents never change repo settings and never
merge with `--admin`.

## read now

```sh
gh api repos/FindMalek/ceraghit/branches/main/protection   # 404 "Branch not protected"
gh api repos/FindMalek/ceraghit/rulesets                   # []
gh api repos/FindMalek/ceraghit --jq '{allow_squash_merge,allow_merge_commit,allow_rebase_merge,delete_branch_on_merge,allow_auto_merge,squash_merge_commit_title,squash_merge_commit_message}'
gh api repos/FindMalek/ceraghit/actions/permissions/workflow
```

| setting | now | effect |
| :-- | :-- | :-- |
| branch protection and rulesets on `main` | none | no required review, no required check, force push and deletion of `main` possible |
| required status checks | none | a red PR can be merged; "CI green" is only enforced by whoever merges |
| conversation resolution required | no | open threads (human, CodeRabbit) do not block the merge |
| squash / merge commit / rebase | true / true / true | a merge commit or rebase merge is one click away |
| squash title / message | `COMMIT_OR_PR_TITLE` / `COMMIT_MESSAGES` | the UI pastes the commit list; the agent command sets `--subject` and `--body ""` so it is fine for them |
| delete branch on merge | false | merged branches stay on the remote |
| auto-merge | false | `gh pr merge --auto` unavailable |
| default workflow token | read, cannot approve PRs | good |
| visibility | public | `pr-assets` screenshots are public: demo data only |

All agents run as the owner's account, so none can approve a PR (GitHub refuses self-approval). That is why "0 required
approvals" is the only setting that works with the current process.

## checks as GitHub lists them

From a recent PR (`gh pr checks <n>`): `lint`, `types`, `test`, `build` (and its three `build (api|web|dashboard)` children),
`e2e` (summary job of the sharded run), `audit`, `migrations`, `pr-body`, `no-ai-attribution`, `changes`, `CodeRabbit`. Require the
ones whose result is a verdict, by their exact names: `lint`, `types`, `test`, `build`, `e2e`, `migrations`, `pr-body`,
`no-ai-attribution`. Leave `audit` advisory (its result depends on the advisory database, not only on the PR), and skip `changes`, `link-issue`
and `cleanup`, which are skipped on some PRs: a required check that is skipped blocks the merge.

## recommended (nothing applied)

1. Merge settings: squash only (`allow_merge_commit=false`, `allow_rebase_merge=false`), `squash_merge_commit_title=PR_TITLE`,
   `squash_merge_commit_message=BLANK`, `delete_branch_on_merge=true` (removes the remote branch only; local worktrees are unaffected).
2. A ruleset on `main` (not classic protection):
   - require a pull request with **0 required approvals**; requiring 1 would block every agent merge and push people to bypass,
   - require conversation resolution,
   - required status checks: `lint`, `types`, `test`, `build`, `e2e`, `migrations`, `pr-body`, `no-ai-attribution`,
   - block force pushes and deletion of `main`,
   - empty bypass list (the owner can still bypass in the UI in an emergency; agents never use `--admin`),
   - leave `pr-assets` unprotected: `pnpm pr:screenshots` pushes to it.
3. CodeRabbit (`.coderabbit.yaml`, `profile: chill`): it never requests changes, so its state blocks nothing; its comments
   are review threads that must be resolved. Draft PRs are not reviewed, so open PRs ready for review. Add path instructions
   for the secrets vault (never return or log a secret), `packages/db/drizzle/**` (additive only), `markPaidManually` (admin
   only, audited), and the mail redirect (never in production). Optional: `request_changes_workflow: true`.
4. Production deploys on every merge to `main` (`DEPLOY_ENABLED=true`), so a ruleset also protects production: until it exists,
   a direct push to `main` ships to the live shop.

Command for the owner to run himself (not an agent):

```sh
gh api -X PATCH repos/FindMalek/ceraghit -F allow_merge_commit=false -F allow_rebase_merge=false \
  -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=BLANK -F delete_branch_on_merge=true
```

The ruleset is easier to create in Settings, Rules, Rulesets, "New branch ruleset", target `main`, than from the CLI.

## checking review threads before a merge (read-only)

```sh
gh api graphql -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100){nodes{isResolved isOutdated comments(first:1){nodes{author{login} body}}}}}}}' -F o=FindMalek -F r=ceraghit -F n=<pr>
```

Wait for CodeRabbit's review of the latest commit before judging "all threads resolved"; it can take a few minutes after each push.
Merge rule and PR body rules: `docs/pr-process.md`.
