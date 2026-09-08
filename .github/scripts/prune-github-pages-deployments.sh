#!/usr/bin/env bash
# Prune stale github-pages deployments — keep the newest N, delete the rest.
# Used by deploy.yml prune-before-deploy and prune-deployments jobs.
set -euo pipefail

KEEP="${1:-10}"
ENV="${2:-github-pages}"
REPO="${REPO:?REPO env var required (owner/repo)}"

ids_output=""
if ! ids_output="$(
  gh api --paginate \
    "repos/${REPO}/deployments?environment=${ENV}&per_page=100" \
    --jq '.[].id' | sort -rn
)"; then
  echo "::error::Failed to list '${ENV}' deployments for ${REPO}" >&2
  exit 1
fi

if [ -z "$ids_output" ]; then
  ids=()
else
  mapfile -t ids <<< "$ids_output"
fi

echo "Found ${#ids[@]} '${ENV}' deployments; keeping newest ${KEEP}."
if [ "${#ids[@]}" -le "${KEEP}" ]; then
  echo "Nothing to prune."
  exit 0
fi
failures=0
for id in "${ids[@]:${KEEP}}"; do
  gh api -X POST "repos/${REPO}/deployments/${id}/statuses" \
    -f state=inactive >/dev/null 2>&1 || true
  if gh api -X DELETE "repos/${REPO}/deployments/${id}" >/dev/null 2>&1; then
    echo "deleted deployment ${id}"
  else
    echo "::warning::could not delete deployment ${id}"
    failures=$((failures + 1))
  fi
  sleep 1
done

if [ "${failures}" -gt 0 ]; then
  echo "::error::Failed to delete ${failures} '${ENV}' deployment(s)." >&2
  exit 1
fi
