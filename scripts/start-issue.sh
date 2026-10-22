#!/usr/bin/env bash
# Starts work on an issue: a linked branch via `gh issue develop`, and the card moves to "In progress".
#
# Usage: pnpm start-issue <issue-number>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ISSUE="${1:?usage: start-issue.sh <issue-number>}"

git switch main && git pull --ff-only
gh issue develop "$ISSUE" --checkout
"$SCRIPT_DIR/gh-project-status.sh" "$ISSUE" "In progress" || true
