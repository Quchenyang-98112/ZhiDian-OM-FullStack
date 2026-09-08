#!/usr/bin/env bash
# Request a CodeRabbit re-review on a pull request.
#
# Cursor Cloud agent tokens cannot post PR comments (403). Prefer pushing a commit
# so `.github/workflows/coderabbit-rereview.yml` posts `@coderabbitai review`
# automatically, or run this script locally with a maintainer `gh` session.
#
# Usage:
#   ./scripts/request-coderabbit-review.sh <pr-number>
#   ./scripts/request-coderabbit-review.sh 266
#
# Manual workflow dispatch (no local gh comment permission needed):
#   gh workflow run coderabbit-rereview.yml -f pr_number=266 -f force=false

set -euo pipefail

PR_NUMBER="${1:-}"
if [[ -z "$PR_NUMBER" ]]; then
  echo "Usage: $0 <pr-number>" >&2
  exit 1
fi

if gh pr comment "$PR_NUMBER" --body "@coderabbitai review" 2>/dev/null; then
  echo "Posted @coderabbitai review on PR #${PR_NUMBER}."
  exit 0
fi

echo "gh pr comment failed (agent token or missing scope). Trying workflow_dispatch..." >&2
gh workflow run coderabbit-rereview.yml \
  -f "pr_number=${PR_NUMBER}" \
  -f "force=false"
echo "Dispatched coderabbit-rereview.yml for PR #${PR_NUMBER}."
