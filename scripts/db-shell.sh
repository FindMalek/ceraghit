#!/usr/bin/env bash
# psql inside a deployed database on the-keep, over ssh (needs the `the-keep` ssh alias).
#
# Usage: pnpm db:shell <prod|pr-N> [psql args...]
#   pnpm db:shell pr-12
#   pnpm db:shell prod -c "select status, count(*) from bookings group by 1"
set -euo pipefail

TARGET="${1:?usage: db-shell.sh <prod|pr-N> [psql args...]}"
shift
case "$TARGET" in
  prod | production) SERVICE="ceraghit-db" ;;
  pr-[0-9]*) SERVICE="ceraghit-db-$TARGET" ;;
  *)
    echo "Unknown target '$TARGET', expected prod or pr-<number>." >&2
    exit 1
    ;;
esac

TTY=""
if [ -t 0 ] && [ $# -eq 0 ]; then TTY="-t"; fi

# Dokploy runs the database as a swarm service named after it, so its container is "<service>.1.<id>".
ARGS=$(printf ' %q' "$@")
ssh $TTY the-keep "C=\$(docker ps -q --filter name=^${SERVICE}\\. | head -n1); \
  if [ -z \"\$C\" ]; then echo 'no running container for ${SERVICE}' >&2; exit 1; fi; \
  docker exec -i $TTY \$C psql -U ceraghit -d ceraghit$ARGS"
