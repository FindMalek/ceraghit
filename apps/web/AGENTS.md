# apps/web

Storefront for Ceraghit Creation: catalogue, cart, checkout (reservation + card payment), custom-piece requests.
Next.js 16 App Router, next-intl, TanStack Query + oRPC, shadcn from `@workspace/ui`.

- Routes live under `app/[locale]` (`fr` default without prefix, `en`, `ar` RTL). `proxy.ts` is next-intl's middleware.
  French is the base: `messages/fr.json` is complete, `en.json` / `ar.json` fall back to it key by key (`i18n/request.ts`).
  A language shows in the switcher only when it is in `ENABLED_LOCALES` (`lib/locales.ts`). DB text is `Localized`, read with `pick()`.
- Prices: every product has a TND and an EUR price (millimes / cents). The visitor's currency is the `ceraghit_currency`
  cookie (default TND), read on the server with `getCurrency()` and on the client with `useCurrency()`. Never add the two.
- Data: server components use `lib/api.ts` (`createServerClient`, a failing api gives an empty state, never a crash).
  Client mutations use `orpc` from `@workspace/orpc/react`. Browsers only call `/api/*`, proxied by `app/api/[...path]`,
  which only forwards `/rpc/public/*` and `/files/*`: never add admin paths here.
- Pages that read the api are `force-dynamic`, the api is not needed at `next build`.
- Cart is a persisted zustand store (`lib/cart-store.ts`). Unique pieces cap at 1; `quoteOnly` pieces never enter the cart
  and link to `/custom?ref=`. Orders are created by the api, payment status only comes from the gateway.
- The order link needs its token: the checkout stores it on the device (`lib/order-tokens.ts`) so the demo gateway can return to it.
- Style: brand tokens only (`packages/ui/src/styles/brand.css`), dark, thin gold `frame` borders, `ornament` divider,
  `font-display` for headlines. Logical properties (`ms-`, `ps-`, `start-`) so RTL works. Touch targets are at least 44px.
- Images are pre-optimised WebP in `public/catalogue` (`unoptimized` in next.config); always give them an aspect box.
- Robots disallow everything unless `APP_ENV=production`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
- Delivery is priced per cart and country by the api (`public.catalog.shippingQuote`, rate card in dashboard settings); checkout and the product page only display the quote and the order recomputes it.
- SEO: pages build metadata with `pageMetadata` (`lib/seo.ts`), structured data comes from `lib/json-ld.ts` through `components/json-ld.tsx`; the sitemap is empty outside production.
