# Ceraghit

**Ceraghit Creation** is the ceramics studio of **Sabri Ghit** in Tunisia: terracotta sculptures and objects, modelled by hand. Curda seca tiles, votive lamps, bas-reliefs, high-reliefs and unique pieces, from a few dinars to made-to-order sculptures.

This repository is the studio's online shop: a storefront in French, English and Arabic, an owner dashboard that works from a phone, and the api behind both.

## Links

| | Production | Staging (homelab, demo data) |
| :-- | :-- | :-- |
| Storefront | [ceraghit.com](https://ceraghit.com) | [ceraghit.findmalek.engineer](https://ceraghit.findmalek.engineer) |
| Owner dashboard | [dashboard.ceraghit.com](https://dashboard.ceraghit.com/login) | [dashboard.ceraghit.findmalek.engineer](https://dashboard.ceraghit.findmalek.engineer) |
| API | [api.ceraghit.com](https://api.ceraghit.com/v1/docs) · [health](https://api.ceraghit.com/health) | [api.ceraghit.findmalek.engineer](https://api.ceraghit.findmalek.engineer/v1/docs) |
| Photos (CDN) | [cdn.ceraghit.com](https://cdn.ceraghit.com) | Garage bucket `ceraghit-dev` |

Every pull request also gets its own preview (storefront, dashboard, api, database and demo data) on `pr-<n>.ceraghit.findmalek.engineer`, with the demo dashboard login in the PR comment.

## How the shop works

- **Two currencies, one product.** Every piece has a price in dinars and a price in euros, both set by the owner, never converted. Visitors in Tunisia see dinars, everyone else euros, detected from their country.
- **Language** follows the visitor's device (French, English or Arabic, right to left), with a switch in the footer.
- **Payment.** Tunisia pays cash on delivery. Other countries pay by bank transfer: the account is on the order page and in the confirmation email, and the owner marks the order paid when the money arrives. Card payment through Konnect is built but switched off (`ONLINE_PAYMENTS`), see [docs/payments.md](docs/payments.md).
- **Photos.** The dashboard compresses every photo to WebP before it goes to Cloudflare R2, tracks storage against the 2.5 GB plan, and a daily job deletes photos nothing has used for 30 days.
- **Social cards.** Every page and product has its own generated Open Graph image, in all three languages.

## Apps

| app | what | dev port |
| :-- | :-- | :-- |
| `apps/web` | storefront, Next.js 16 | 3000 |
| `apps/dashboard` | owner dashboard, phone first | 3100 |
| `apps/api` | oRPC + REST api, Drizzle + Postgres | 3001 |
| `packages/*` | `db`, `orpc`, `sdk`, `ui` (brand and shadcn) | |

Production runs on Vercel (three projects), Neon Postgres and Cloudflare R2. Previews and staging run on a homelab (Dokploy, Garage).

## Run it

```bash
cp .env.example .env
pnpm install
pnpm db:up && pnpm db:migrate && pnpm db:seed   # Postgres on :5435, the catalogue + demo orders
pnpm dev:web          # storefront + api
pnpm dev:dashboard    # dashboard + api (login with ADMIN_EMAIL / ADMIN_PASSWORD from .env)
```

Checks: `pnpm check` (format), `pnpm lint`, `pnpm check-types`, `pnpm test` (needs `DATABASE_URL`), `pnpm build`.

## Docs

- Deploy, previews, environments and the daily jobs: [docs/deploy.md](docs/deploy.md)
- Payments: [docs/payments.md](docs/payments.md)
- Brand and how to change it: [docs/brand.md](docs/brand.md)
- Contract and price notes: [docs/contract.md](docs/contract.md)
- Agent rules: [AGENTS.md](AGENTS.md) and `.cursor/rules/`
