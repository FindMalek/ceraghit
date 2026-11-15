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
A production row is unreadable with any other key, and previews never receive production data. Set it only on the api
Vercel project (never `NEXT_PUBLIC_*`, never web or dashboard). Production refuses to boot without it.

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

Saved secrets cannot be recovered: the owner re-enters them. Env values keep Konnect working meanwhile.
