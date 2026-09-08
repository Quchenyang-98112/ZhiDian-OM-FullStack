#!/usr/bin/env bash
# Fetch CodeRabbit "outside diff range" comments from PR review bodies.
# These do NOT appear in GraphQL reviewThreads — only in review .body HTML.
#
# Usage:
#   ./scripts/fetch-coderabbit-outside-diff.sh <pr-number>
#   ./scripts/fetch-coderabbit-outside-diff.sh 265
#
# Requires: gh CLI authenticated for the repo.

set -euo pipefail

PR="${1:?PR number required}"

REPO="${GITHUB_REPOSITORY:-qnbs/Nexus-HEMS-Dash}"

echo "=== CodeRabbit outside-diff comments for PR #${PR} (${REPO}) ==="
echo

GH_PAGER=cat PAGER=cat gh api "repos/${REPO}/pulls/${PR}/reviews?per_page=100" \
  --jq '.[].body' \
  | rg -n "Outside diff|outside diff range|⚠️ Outside" -A 20 \
  || echo "(no outside-diff sections found)"

echo
echo "Tip: inline threads still need GraphQL — see docs/runbooks/pr-review-correction-loop.md §4"
