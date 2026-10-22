# ceraghit

Ceramics studio shop for Ceraghit Creation (Sabri Ghit): storefront (`apps/web`), owner dashboard (`apps/dashboard`),
api (`apps/api`). Catalogue content comes from the 2027 PDF catalogue, the look follows it exactly.

Single source of truth for agent rules is this file plus `.cursor/rules/**` (imported by `CLAUDE.md`). Edit rules there,
then run `pnpm rules:check` (CI runs it too). Do not create other copies of the rules.

## The five things that are easy to get wrong

1. **Two currencies, one product.** Every product has `priceTnd` (millimes, 1 DT = 1000) and `priceEur` (cents), both
   required, set by the owner. Never convert one into the other and never add the two. Orders snapshot their currency.
2. **Environments never mix.** `APP_ENV` is `local` | `preview` | `production`. Live payment keys, the Cloudflare R2
   bucket and the Neon database exist only in production; previews use the homelab (Postgres per PR, Garage bucket,
   demo gateway or Konnect sandbox). `apps/api/src/env.ts` refuses a mismatch at boot. Don't weaken it.
3. **Payment status only comes from the gateway.** The Konnect webhook is unsigned and is only a hint: `settleOrder`
   re-asks Konnect and checks amount, currency and order number. Never set an order to paid from request data.
4. **Public and admin never share a procedure.** `packages/orpc/src/routers/public` vs `.../admin`, admin built only on
   `adminProcedure`. Each app's `/api` proxy only forwards its own namespace (`packages/sdk/src/proxy.ts`). A test
   walks the admin router and fails if any procedure answers a visitor.
5. **Brand lives in one file.** `packages/ui/src/styles/brand.css`. Components use shadcn tokens, never raw colours.

## Stack and commands

pnpm + Turborepo, Next.js 16 (App Router, `proxy.ts`, `params` are Promises), oRPC, Drizzle + Postgres, shadcn
(`base-maia`, Base UI, Phosphor), Biome, `bun test`. Node >= 24.

- `pnpm dev`, `pnpm dev:web`, `pnpm dev:dashboard`; `pnpm db:up` (local Postgres on :5435), `pnpm db:migrate`, `pnpm db:seed`
- `pnpm check` (Biome fix), `pnpm lint`, `pnpm check-types`, `pnpm test`, `pnpm build`, `pnpm rules:check`
- `pnpm ui:add <name>` for shadcn components; don't hand-write what the registry has
- `pnpm start-issue <n>` starts work on an issue (linked branch + board status)

## Rules

- API: every procedure has `.route()`, `.input()`, `.output()` from `@workspace/sdk` and throws `ORPCError` with a
  guest-safe message. Server components use `createServerClient()`, client components use `orpc.*` with TanStack Query.
- DB: change `packages/db/src/schema.ts`, then `pnpm db:generate`. Never hand-write a migration; CI fails on drift.
  Production migrates in the deploy workflow, the api does not migrate itself there.
- Demo/preview data: `packages/db/src/seed`. A feature that adds a state adds it to `scenario.ts` and its test.
- Text shown to people is French first; DB text is `Localized` (`fr` required, `en`/`ar` optional) read with `pick()`.
- Tests: one per behavior, through the public function or endpoint, mock only network/time. Don't test types or getters.
- Commits `type(scope): subject`, one issue per PR, branch via `gh issue develop <n> --checkout`. Agents do not commit,
  push or reply to reviews unless the owner says so in that message. No AI attribution anywhere.

Next.js docs for this version: `node_modules/next/dist/docs/`, read the relevant guide before writing Next code.
