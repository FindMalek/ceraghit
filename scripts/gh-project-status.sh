#!/usr/bin/env bash
# Moves an issue or PR on the Ceraghit GitHub Project (#19) to a given Status.
#
# Usage: scripts/gh-project-status.sh <issue-or-pr-number> <status>
#   status: Backlog | Ready | "In progress" | "In review" | "On hold" | Done
set -euo pipefail

OWNER="FindMalek"
PROJECT_NUMBER=19

NUMBER="${1:?usage: gh-project-status.sh <issue-or-pr-number> <status>}"
STATUS="${2:?usage: gh-project-status.sh <issue-or-pr-number> <status>}"

PROJECT_ID=$(gh project view "$PROJECT_NUMBER" --owner "$OWNER" --format json --jq '.id')
FIELD=$(gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --format json --jq '.fields[] | select(.name == "Status")')
STATUS_FIELD_ID=$(jq -r '.id' <<<"$FIELD")
OPTION_ID=$(jq -r --arg s "$STATUS" '.options[] | select(.name == $s) | .id' <<<"$FIELD")

if [ -z "$OPTION_ID" ]; then
  echo "Unknown status '$STATUS'. Expected one of: $(jq -r '[.options[].name] | join(", ")' <<<"$FIELD")" >&2
  exit 1
fi

ITEM_ID=$(gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" --format json --limit 500 \
  | jq -r --argjson n "$NUMBER" '.items[] | select(.content.number == $n) | .id' | head -n1)

if [ -z "$ITEM_ID" ]; then
  echo "No project item found for #$NUMBER on project $PROJECT_NUMBER. Is it added to the board?" >&2
  exit 1
fi

gh project item-edit --id "$ITEM_ID" --project-id "$PROJECT_ID" --field-id "$STATUS_FIELD_ID" \
  --single-select-option-id "$OPTION_ID" > /dev/null

echo "Moved #$NUMBER to '$STATUS'."
