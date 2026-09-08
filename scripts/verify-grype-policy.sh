#!/usr/bin/env bash
# Guardrail for .grype.yaml — prevents unbounded global suppressions.
# Invoked from sbom-scan.yml before Grype image scans.
set -euo pipefail

POLICY_FILE=".grype.yaml"

if [[ ! -f "$POLICY_FILE" ]]; then
  echo "error: missing $POLICY_FILE" >&2
  exit 1
fi

# Hard cap: new ignores require explicit security review + registry update.
IGNORE_COUNT="$(grep -cE '^\s*- vulnerability:' "$POLICY_FILE" || true)"
MAX_IGNORES=5
if [[ "$IGNORE_COUNT" -gt "$MAX_IGNORES" ]]; then
  echo "error: $POLICY_FILE has $IGNORE_COUNT ignore rules (max $MAX_IGNORES)" >&2
  exit 1
fi

if ! grep -q 'CVE-2026-5450' "$POLICY_FILE"; then
  echo "error: expected documented CVE-2026-5450 exception in $POLICY_FILE" >&2
  exit 1
fi

if ! grep -q 'reason:' "$POLICY_FILE"; then
  echo "error: each ignore rule must include a reason field" >&2
  exit 1
fi

if grep -q 'only-fixed' "$POLICY_FILE" 2>/dev/null; then
  echo "error: do not use only-fixed in $POLICY_FILE — use targeted ignore rules" >&2
  exit 1
fi

echo "Grype policy guardrail OK ($IGNORE_COUNT ignore rule(s) in $POLICY_FILE)"
