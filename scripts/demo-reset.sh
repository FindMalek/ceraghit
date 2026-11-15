#!/usr/bin/env bash
# Drops the local Postgres volume and rebuilds the demo state (migrations + catalogue + demo orders).
# Refuses anything but the local database on :5435. Stop `pnpm dev` first, it holds connections.
#
# Usage: pnpm demo:reset
set -euo pipefail

cd "$(dirname "$0")/.."

# variables already set in the shell win over .env, so a wrong DATABASE_URL is caught
SHELL_DATABASE_URL="${DATABASE_URL-}"
SHELL_APP_ENV="${APP_ENV-}"
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
[ -z "$SHELL_DATABASE_URL" ] || export DATABASE_URL="$SHELL_DATABASE_URL"
[ -z "$SHELL_APP_ENV" ] || export APP_ENV="$SHELL_APP_ENV"

COMPOSE=(docker compose -f docker/docker-compose.yml)
URL="${DATABASE_URL:-}"
SAFE_URL="$(printf '%s' "$URL" | sed -E 's#(://[^:/@]*):[^@]*@#\1:***@#')"

refuse() {
  echo "demo:reset refused: $1" >&2
  echo "  DATABASE_URL=${SAFE_URL:-<unset>}  APP_ENV=${APP_ENV:-<unset>}" >&2
  exit 1
}

case "${APP_ENV:-local}" in
  production | preview) refuse "APP_ENV is ${APP_ENV}, this only resets the local database" ;;
esac

HOSTPORT="$(printf '%s' "$URL" | sed -nE 's#^[a-z]+://[^@]*@([^/?]+).*#\1#p')"
case "$HOSTPORT" in
  localhost:5435 | 127.0.0.1:5435) ;;
  *) refuse "DATABASE_URL must point at localhost:5435 or 127.0.0.1:5435" ;;
esac

if lsof -nP -iTCP:3001 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "warning: something listens on :3001 (the api from pnpm dev), stop it first or it keeps stale connections" >&2
fi

echo "==> removing the local database volume"
"${COMPOSE[@]}" down -v

echo "==> starting postgres"
"${COMPOSE[@]}" up -d --wait

echo "==> migrating"
pnpm db:migrate

echo "==> seeding the demo"
pnpm db:seed

echo "demo database ready, dashboard login: ${ADMIN_EMAIL:-<set ADMIN_EMAIL in .env>}"
