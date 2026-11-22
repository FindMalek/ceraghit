# ceraghit

Ceramics studio shop for Ceraghit Creation (Sabri Ghit): storefront (`apps/web`), owner dashboard (`apps/dashboard`),
api (`apps/api`). Catalogue content comes from the 2027 PDF catalogue, the look follows it exactly.

Single source of truth for agent rules is this file plus `.cursor/rules/**` (imported by `CLAUDE.md`). Edit rules there,
then run `pnpm rules:check` (CI runs it too). Do not create other copies of the rules.

## The six things that are easy to get wrong

1. **Two currencies, one product.** Every product has `priceTnd` (millimes, 1 DT = 1000) and `priceEur` (cents), both
   required, set by the owner. Never convert one into the other and never add the two. Orders snapshot their currency.
2. **Environments never mix.** `APP_ENV` is `local` | `preview` | `production`. Live payment keys, the Cloudflare R2
   bucket and the Neon database exist only in production; previews use the homelab (Postgres per PR, Garage bucket,
   demo gateway or Konnect sandbox). `apps/api/src/env.ts` refuses a mismatch at boot. Don't weaken it.
3. **Payment status only comes from the gateway, or from the owner.** The Konnect webhook is unsigned and is only a hint:
   `settleOrder` re-asks Konnect and checks amount, currency and order number. The only other way to paid is
   `markPaidManually` (admin only, audited in `order_audit`), for transfers and Payoneer links the gateway never sees.
   Never set an order to paid from request data.
4. **Public and admin never share a procedure.** `packages/orpc/src/routers/public` vs `.../admin`, admin built only on
   `adminProcedure`. Each app's `/api` proxy only forwards its own namespace (`packages/sdk/src/proxy.ts`). A test
   walks the admin router and fails if any procedure answers a visitor.
5. **Brand lives in one file.** `packages/ui/src/styles/brand.css`. Components use shadcn tokens, never raw colours.
6. **Production migrates on merge.** Migrations are additive and backward compatible (expand, then contract in a later
   release); the `migrations` check blocks drops, renames, type changes and NOT NULL without default. Only one open PR
   may contain a migration.

## Stack and commands

pnpm + Turborepo, Next.js 16 (App Router, `proxy.ts`, `params` are Promises), oRPC, Drizzle + Postgres, shadcn
(`base-maia`, Base UI, Phosphor), Biome, `bun test`. Node >= 24.

- `pnpm dev`, `pnpm dev:web`, `pnpm dev:dashboard`; `pnpm db:up` (local Postgres on :5435), `pnpm db:migrate`, `pnpm db:seed`
- `pnpm check` (Biome fix), `pnpm lint`, `pnpm check-types`, `pnpm test`, `pnpm build`, `pnpm rules:check`
- `pnpm ui:add <name>` for shadcn components; don't hand-write what the registry has
- `pnpm e2e` (Playwright, `test/e2e`, needs Docker), `pnpm demo:reset` (fresh local demo db), `pnpm pr:screenshots`
  (uploads screenshots, prints markdown)
- `pnpm start-issue <n>` starts work on an issue (linked branch + board status)

## Rules

- API: every procedure has `.route()`, `.input()`, `.output()` from `@workspace/sdk` and throws `ORPCError` with a
  guest-safe message. Server components use `createServerClient()`, client components use `orpc.*` with TanStack Query.
- DB: change `packages/db/src/schema.ts`, then `pnpm db:generate`. Never hand-write a migration; CI fails on drift.
  Production migrates in the deploy workflow, the api does not migrate itself there.
- Demo/preview data: `packages/db/src/seed`. A feature that adds a state adds it to `scenario.ts` and its test.
- Text shown to people is French first; DB text is `Localized` (`fr` required, `en`/`ar` optional) read with `pick()`.
- fr/en/ar strings stay about the same length: `apps/web/test/messages-parity.test.ts` enforces the bands in
  `packages/sdk/src/i18n-parity.ts`. Rewrite the long or short side so it reads naturally, never pad with filler.
- Tests: one per behavior, through the public function or endpoint, mock only network/time. Don't test types or getters.
  Files live in the package's `test/` folder (`<pkg>/test/<path>.test.ts`), e2e in `test/e2e/specs/<feature>.e2e.ts`.
  When e2e fails, fix the product, not the test.
- Scheduled work is an idempotent `POST /cron/<name>` on the api (bearer `CRON_SECRET`, routed in
  `apps/api/src/server.ts`); the scheduler only calls it.
- Every PR body has inline screenshots of everything tested (desktop + mobile, fr/en/ar when text changes), uploaded
  with `pnpm pr:screenshots`; demo data only, no secrets. Details in `docs/pr-process.md`.
- Squash-merge only when CI is green, every review thread (incl. CodeRabbit) is resolved, the review says LGTM and the
  screenshots are in the body: `gh pr merge <n> --squash --subject "<title> (#<n>)" --body ""`. If GitHub demands an
  approval, stop and ask the owner; never `--admin`.
- Commits `type(scope): subject`, one issue per PR, branch via `gh issue develop <n> --checkout`. Agents do not commit,
  push or reply to reviews unless the owner says so in that message. No AI attribution anywhere.

Owner guide (French) is `docs/handover.md`, operator runbook is `docs/runbook.md`: update them when a screen or an ops step changes.

Next.js docs for this version: `node_modules/next/dist/docs/`, read the relevant guide before writing Next code.
