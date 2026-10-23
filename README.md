# ceraghit

Online shop for Ceraghit Creation's ceramics: storefront, owner dashboard and api in a Turborepo.

| app | what | staging | dev port |
| :-- | :-- | :-- | :-- |
| `apps/web` | storefront (fr, en, ar), TND and EUR | [ceraghit.findmalek.engineer](https://ceraghit.findmalek.engineer) | 3000 |
| `apps/dashboard` | owner dashboard | [dashboard.ceraghit.findmalek.engineer](https://dashboard.ceraghit.findmalek.engineer) | 3100 |
| `apps/api` | oRPC + REST api, Konnect payments | [api.ceraghit.findmalek.engineer](https://api.ceraghit.findmalek.engineer/v1/docs) | 3001 |

```bash
cp .env.example .env
pnpm install
pnpm db:up && pnpm db:migrate && pnpm db:seed   # Postgres on :5435, the PDF catalogue + demo orders
pnpm dev:web          # storefront + api
pnpm dev:dashboard    # dashboard + api (login with ADMIN_EMAIL / ADMIN_PASSWORD from .env)
```

Checks: `pnpm check` (format), `pnpm lint`, `pnpm check-types`, `pnpm test` (needs `DATABASE_URL`), `pnpm build`.

- Deploy, previews and environments: [docs/deploy.md](docs/deploy.md)
- Payments (Konnect): [docs/payments.md](docs/payments.md)
- Brand and how to change it: [docs/brand.md](docs/brand.md)
- Contract and price notes: [docs/contract.md](docs/contract.md)
- Agent rules: [AGENTS.md](AGENTS.md) and `.cursor/rules/`
