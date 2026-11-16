# Provider secrets (vault)

Konnect, Aramex and Groq credentials the owner enters in the dashboard are stored in `integration_credentials`
(`packages/db/src/schema.ts`). Secret fields are one JSON object encrypted with AES-256-GCM
(`packages/orpc/src/lib/secrets.ts`): a random 12-byte IV per write, the 16-byte tag, the key version in the row and
`integration:<provider>` as authenticated data, so a ciphertext copied to another provider fails to decrypt. Non-secret
settings (wallet id, mode) sit in the `config` column in clear. The row also keeps `updated_by` (admin) and `updated_at`.

- Secrets are write-only. `admin.integrations.get|list|save` return `{ configured, hint }` per field (hint = `••••` plus the
  last 4 characters, only for values of 16+ characters). Nothing returns a value, and no log line or error message holds one.
- Provider clients decrypt per call with `getSecret(services, provider)`: a saved row wins as a whole, otherwise the env
  values (`services.config.envCredentials`) are used. No cache, so a save or rotation is seen at once.
- Without `SECRETS_KEY` (local, previews) the vault is unavailable: saving is refused, env fallback still works.

## Environments never mix

`SECRETS_KEY` is generated per environment: production has its own, every preview/local run has a different one (or none).
A production row is unreadable with any other key, and previews never receive production data. Set it only on the api Vercel project (never `NEXT_PUBLIC_*`, never web or dashboard).

## When the key is required

`SECRETS_KEY` stays optional at boot, so a missing key never takes the api down by itself. Instead:

- Saving credentials without a key is refused with `PRECONDITION_FAILED` ("Le coffre des clés n'est pas configuré sur ce serveur.").
- Using saved credentials without a key (Aramex test, provider resolution) is refused with `PRECONDITION_FAILED` in French,
  instead of silently falling back to env values.
- The api refuses to boot only when an `integration_credentials` row holds secrets while no key is configured
  (`assertVaultKeyForRows`): the data would be unreadable and every provider call would degrade. Set the key the data was
  saved with, or clear the row from the database.

## Owner checklist (production, Vercel api project)

1. `SECRETS_KEY`: generate with the command below, store a copy in the password manager (a lost key means re-entering secrets).
2. Optional env fallback for Aramex, only if the owner does not enter credentials in the dashboard: `ARAMEX_USERNAME`,
   `ARAMEX_PASSWORD`, `ARAMEX_ACCOUNT_NUMBER`, `ARAMEX_ACCOUNT_PIN`, `ARAMEX_ACCOUNT_ENTITY`, `ARAMEX_ACCOUNT_COUNTRY_CODE`.
3. Redeploy the api, then open Livraison in the dashboard and use "Tester la connexion".

## Generate a key

```sh
node -e "console.log('1:'+require('crypto').randomBytes(32).toString('base64'))"
```

Format `<version>:<base64 of 32 bytes>`, version is a positive integer.

## Rotate

1. Generate a new key with version + 1.
2. Production env: `SECRETS_KEY=<new>`, `SECRETS_KEY_PREVIOUS=<old>`; deploy. Both keys decrypt, writes use the new one.
3. Run `pnpm --filter api secrets:rotate` with the production env (`DATABASE_URL`, both keys). It prints `{ "rotated": n }` only.
4. Remove `SECRETS_KEY_PREVIOUS`; deploy.

## Lost key

Saved secrets cannot be recovered: the owner re-enters them. Reads fall back to the env values while the key is wrong, and saving asks the owner to clear the unreadable row first (`clear` keeps the row with who and when, secrets emptied).
