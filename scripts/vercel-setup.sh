#!/usr/bin/env bash
# One-time Vercel setup for production: creates/links the three projects, disconnects their Git integration (deploys
# come from .github/workflows/deploy.yml) and pushes the production env vars from .env.production.local.
#
# Usage:
#   cp docs/production.env.example .env.production.local   # fill it in
#   vercel login
#   scripts/vercel-setup.sh [scope]        # scope = your Vercel team slug, e.g. findmalek-team
#
# Safe to re-run: existing vars are replaced. Only the "production" environment is touched.
set -euo pipefail

SCOPE="${1:-findmalek-team}"
ENV_FILE=".env.production.local"
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE (see docs/production.env.example)" >&2; exit 1; }

val() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2-; }
require() { [ -n "$(val "$1")" ] || { echo "$1 is empty in $ENV_FILE" >&2; exit 1; }; }

push() { # app NAME VALUE
  printf '%s' "$3" | vercel env add "$2" production --cwd "apps/$1" --scope "$SCOPE" --force >/dev/null
  echo "  $1: $2"
}

for v in WEB_URL API_PUBLIC_URL API_URL DATABASE_URL KONNECT_API_KEY KONNECT_WALLET_ID S3_ENDPOINT S3_BUCKET \
  S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_PUBLIC_URL; do require "$v"; done

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
push api KONNECT_MODE live
push api S3_REGION auto
push api DB_POOL_MAX 5
for n in DATABASE_URL WEB_URL API_PUBLIC_URL KONNECT_API_KEY KONNECT_WALLET_ID S3_ENDPOINT S3_BUCKET S3_ACCESS_KEY_ID \
  S3_SECRET_ACCESS_KEY S3_PUBLIC_URL; do push api "$n" "$(val "$n")"; done
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
