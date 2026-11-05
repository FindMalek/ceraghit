#!/usr/bin/env bash
# One-time: puts the production secrets and variables in the GitHub `production` environment, read from
# .env.production.local, so deploy.yml (migrate, deploy, smoke) and cleanup-uploads.yml can run.
# VERCEL_TOKEN, VERCEL_ORG_ID and VERCEL_PROJECT_ID_* are not set here: the token is yours, the ids come from vercel-setup.sh.
#
# Usage: scripts/github-setup.sh        (needs `gh auth login`)
set -euo pipefail

ENV_FILE=".env.production.local"
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE (see docs/production.env.example)" >&2; exit 1; }
val() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2-; }
require() { [ -n "$(val "$1")" ] || { echo "$1 is empty in $ENV_FILE" >&2; exit 1; }; }
for v in DATABASE_URL_DIRECT ADMIN_EMAIL ADMIN_PASSWORD CRON_SECRET; do require "$v"; done

ENVIRONMENT="production"
secret() { printf '%s' "$2" | gh secret set "$1" --env "$ENVIRONMENT" >/dev/null && echo "  secret $1"; }
variable() { gh variable set "$1" --env "$ENVIRONMENT" --body "$2" >/dev/null && echo "  var    $1=$2"; }

echo "== GitHub environment: $ENVIRONMENT"
secret DATABASE_URL "$(val DATABASE_URL_DIRECT)"
secret ADMIN_PASSWORD "$(val ADMIN_PASSWORD)"
secret CRON_SECRET "$(val CRON_SECRET)"
variable ADMIN_EMAIL "$(val ADMIN_EMAIL)"
web_host=$(val WEB_URL); web_host=${web_host#https://}
api_host=$(val API_PUBLIC_URL); api_host=${api_host#https://}
variable PRODUCTION_WEB_HOST "$web_host"
variable PRODUCTION_API_HOST "$api_host"
variable PRODUCTION_DASHBOARD_HOST "dashboard.$web_host"
echo
echo "Still to add by hand: secret VERCEL_TOKEN (done), and after vercel-setup.sh the variables it prints."
echo "When the domains answer, turn deploys on: gh variable set DEPLOY_ENABLED --body true"
