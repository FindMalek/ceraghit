#!/usr/bin/env bash
# One-time Vercel setup for production: creates/links the three projects, disconnects their Git integration (deploys
# come from .github/workflows/deploy.yml) and pushes the production env vars from .env.production.local.
#
# Usage:
#   cp docs/production.env.example .env.production.local   # fill it in
#   npx vercel@65.9.0 login      (or vercel login)
#   scripts/vercel-setup.sh [scope]        # scope = your Vercel team slug, e.g. findmalek-team
#
# Safe to re-run: existing vars are replaced. Only the "production" environment is touched.
set -euo pipefail

# Works without a global install: `npx vercel@65.9.0` after `npx vercel@65.9.0 login` (latest once resolved to a missing version).
if ! command -v vercel >/dev/null 2>&1; then vercel() { npx --yes vercel@65.9.0 "$@"; }; fi

SCOPE="${1:-findmalek-team}"
ENV_FILE=".env.production.local"
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE (see docs/production.env.example)" >&2; exit 1; }

val() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2-; }
require() { [ -n "$(val "$1")" ] || { echo "$1 is empty in $ENV_FILE" >&2; exit 1; }; }

# ALLOW_MISSING_S3=1: run before the R2 keys exist, empty S3_* values are skipped (re-run once they are filled in).
SECRET_NAMES=" DATABASE_URL RESEND_API_KEY CRON_SECRET KONNECT_API_KEY S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY "
S3_NAMES=" S3_ENDPOINT S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_PUBLIC_URL "

push() { # app NAME VALUE
  if [ -z "$3" ] && [ "${ALLOW_MISSING_S3:-}" = 1 ] && [[ "$S3_NAMES" == *" $2 "* ]]; then echo "  $1: $2 skipped (empty)"; return; fi
  # Secrets are hidden from `vercel pull`; everything else stays readable so `vercel build` sees APP_ENV, WEB_URL, ...
  local kind=--no-sensitive
  [[ "$SECRET_NAMES" == *" $2 "* ]] && kind=--sensitive
  printf '%s' "$3" | vercel env add "$2" --environment production "$kind" --cwd "apps/$1" --scope "$SCOPE" --force >/dev/null
  echo "  $1: $2"
}

for v in WEB_URL API_PUBLIC_URL API_URL DATABASE_URL RESEND_API_KEY EMAIL_FROM CRON_SECRET \
  S3_ENDPOINT S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_PUBLIC_URL; do
  [ "${ALLOW_MISSING_S3:-}" = 1 ] && [[ "$S3_NAMES" == *" $v "* ]] && continue
  require "$v"
done

for app in api web dashboard; do
  echo "== ceraghit-$app"
  vercel link --yes --project "ceraghit-$app" --cwd "apps/$app" --scope "$SCOPE" >/dev/null
  vercel git disconnect --yes --cwd "apps/$app" --scope "$SCOPE" >/dev/null 2>&1 || true
done

echo "== env vars (production)"
push api APP_ENV production
push api DEPLOY_ENV production
push api BOOTSTRAP false
push api SEED_DEMO false
push api ONLINE_PAYMENTS false
push api S3_REGION auto
push api DB_POOL_MAX 5
for n in DATABASE_URL WEB_URL API_PUBLIC_URL CRON_SECRET RESEND_API_KEY EMAIL_FROM S3_ENDPOINT S3_BUCKET S3_ACCESS_KEY_ID \
  S3_SECRET_ACCESS_KEY S3_PUBLIC_URL; do push api "$n" "$(val "$n")"; done
# Online payment is off, so Konnect is not needed. To turn it on later: ONLINE_PAYMENTS=true, KONNECT_MODE=live and the two keys.
if [ -n "$(val KONNECT_API_KEY)" ] && [ -n "$(val KONNECT_WALLET_ID)" ]; then
  push api KONNECT_API_KEY "$(val KONNECT_API_KEY)"
  push api KONNECT_WALLET_ID "$(val KONNECT_WALLET_ID)"
  push api KONNECT_MODE live
fi
for app in web dashboard; do
  push "$app" APP_ENV production
  push "$app" API_URL "$(val API_URL)"
  push "$app" WEB_URL "$(val WEB_URL)"
done

echo
echo "Done. Next: add the domains in each project (Settings > Domains), then put these in GitHub:"
for app in api web dashboard; do
  id=$(grep -o '"projectId":"[^"]*"' "apps/$app/.vercel/project.json" | cut -d'"' -f4)
  echo "  VERCEL_PROJECT_ID_$(echo "$app" | tr a-z A-Z)=$id"
done
echo "  VERCEL_ORG_ID=$(grep -o '"orgId":"[^"]*"' apps/api/.vercel/project.json | cut -d'"' -f4)"
