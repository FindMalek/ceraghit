# dashboard

Owner dashboard for Ceraghit (French UI). Talks only to the api's `admin` router through its own `/api` proxy
(`app/api/[...path]/route.ts` allows `/rpc/admin/*` and `/files/*` only), signed in with the `ceraghit_admin` cookie.

- Pages are thin server components in `app/(app)/*`; the work happens in client components under `components/*` with
  `useQuery(orpc.admin.….queryOptions())` / `useMutation(….mutationOptions())` from `@workspace/orpc/react`.
  `(app)/layout.tsx` calls `admin()` (`lib/api.ts`), which sends an expired session to `/login`.
- Money: every product has a TND price (millimes) and an EUR price (cents). Inputs are plain decimals converted with
  `inputToMinor` / `minorToInput` (`lib/money.ts`). Stats show the two currencies side by side, never summed.
- Text that can be translated uses `LocalizedField` (FR required, EN/AR optional) and `lib/localized.ts`.
- Images upload straight to the bucket through `admin.uploads.sign` (`components/image-field.tsx`), a pasted `/path`
  or URL is the fallback when storage isn't configured.
- Product quick actions (publish, stock) resend the whole product with `productToInput(product, patch)`.
- Shipping: products carry packed weight and box size (product form), the rate card lives in Réglages
  (`components/shipping-rates-editor.tsx`, draft/validation in `lib/shipping-draft.ts`), and `/shipping` prices a cart
  with the same pure `estimateShipping` the api uses at checkout. The numbers are estimates, not a DHL tariff.
- Countries are ISO codes everywhere; show names with `countryName(code, "fr")`.
- UI is shadcn from `@workspace/ui`; brand colours and fonts come from the brand tokens, never hard-coded hex.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
