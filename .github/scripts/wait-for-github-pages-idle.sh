#!/usr/bin/env bash
# Block until github-pages has no in-flight deployment and optional cooldown elapsed.
# Mitigates transient "Deployment failed, try again later" after rapid main pushes.
set -euo pipefail

ENV="${1:-github-pages}"
MIN_COOLDOWN_SEC="${2:-180}"
MAX_WAIT_SEC="${3:-900}"
POLL_SEC="${4:-20}"
STALE_IN_PROGRESS_SEC="${5:-180}"
REPO="${REPO:?REPO env var required (owner/repo)}"
CURRENT_SHA="${GITHUB_SHA:-}"

deadline=$((SECONDS + MAX_WAIT_SEC))
ACTIVE_STATES='^(queued|waiting|pending|in_progress)$'

latest_status_state() {
  local deployment_id="$1"
  gh api "repos/${REPO}/deployments/${deployment_id}/statuses?per_page=20" \
    --jq 'sort_by(.created_at) | last | .state // "unknown"'
}

latest_status_updated() {
  local deployment_id="$1"
  gh api "repos/${REPO}/deployments/${deployment_id}/statuses?per_page=20" \
    --jq 'sort_by(.created_at) | last | .updated_at // empty'
}

deployment_sha() {
  local deployment_id="$1"
  gh api "repos/${REPO}/deployments/${deployment_id}" --jq '.sha // empty'
}

status_age_sec() {
  local updated_at="$1"
  local updated_epoch now_epoch
  updated_epoch="$(date -u -d "$updated_at" +%s)"
  now_epoch="$(date -u +%s)"
  echo $((now_epoch - updated_epoch))
}

echo "Waiting for '${ENV}' to be idle (cooldown=${MIN_COOLDOWN_SEC}s, max=${MAX_WAIT_SEC}s, stale=${STALE_IN_PROGRESS_SEC}s, sha=${CURRENT_SHA:-n/a})."

while [ "$SECONDS" -lt "$deadline" ]; do
  latest_id="$(gh api "repos/${REPO}/deployments?environment=${ENV}&per_page=1" --jq '.[0].id // empty' 2>/dev/null || true)"
  if [ -z "$latest_id" ]; then
    echo "No '${ENV}' deployments found; ready to publish."
    exit 0
  fi

  latest_state="$(latest_status_state "$latest_id")"
  latest_updated="$(latest_status_updated "$latest_id")"
  latest_sha="$(deployment_sha "$latest_id")"
  echo "Latest deployment ${latest_id}: state=${latest_state}, sha=${latest_sha:-n/a}, updated=${latest_updated:-n/a}"

  if [[ "$latest_state" =~ $ACTIVE_STATES ]]; then
    # upload-pages-artifact reserves a deployment for the current commit; deploy-pages completes it.
    if [ -n "$CURRENT_SHA" ] && [ "$latest_sha" = "$CURRENT_SHA" ]; then
      echo "Latest active deployment ${latest_id} is for current commit ${CURRENT_SHA}; proceeding to deploy-pages."
      exit 0
    fi

    if [ -n "$latest_updated" ]; then
      age="$(status_age_sec "$latest_updated")"
      if [ "$age" -ge "$STALE_IN_PROGRESS_SEC" ]; then
        echo "::warning::Deployment ${latest_id} stuck in ${latest_state} for ${age}s; proceeding anyway."
        break
      fi
    fi
    echo "Deployment still active; sleeping ${POLL_SEC}s..."
    sleep "$POLL_SEC"
    continue
  fi

  if [ "$latest_state" = "success" ] && [ -n "$latest_updated" ]; then
    age="$(status_age_sec "$latest_updated")"
    if [ "$age" -lt "$MIN_COOLDOWN_SEC" ]; then
      wait_for=$((MIN_COOLDOWN_SEC - age))
      echo "Last successful publish ${age}s ago; sleeping ${wait_for}s for cooldown."
      sleep "$wait_for"
    fi
  fi

  echo "Environment '${ENV}' is idle; proceeding."
  exit 0
done

if [ "$SECONDS" -ge "$deadline" ]; then
  echo "::error::Timed out after ${MAX_WAIT_SEC}s waiting for '${ENV}' to become idle." >&2
  exit 1
fi

echo "Environment '${ENV}' is idle (stale active deployment ignored); proceeding."
exit 0
