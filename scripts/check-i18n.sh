#!/usr/bin/env bash
# Verifies that en.ts and de.ts have the same top-level section keys.
# Exits 1 and prints a diff if they diverge; exits 0 otherwise.
set -euo pipefail

BASE="apps/web/src/locales"

extract_keys() {
  grep -E '^  [a-zA-Z_]+:' "$1" | sed 's/:.*//' | tr -d ' ' | sort
}

EN_KEYS=$(extract_keys "$BASE/en.ts")
DE_KEYS=$(extract_keys "$BASE/de.ts")

if [ "$EN_KEYS" != "$DE_KEYS" ]; then
  echo "⚠  i18n top-level key mismatch between en.ts and de.ts:"
  diff <(echo "$EN_KEYS") <(echo "$DE_KEYS") || true
  exit 1
fi

EN_LINES=$(wc -l < "$BASE/en.ts")
DE_LINES=$(wc -l < "$BASE/de.ts")
DELTA=$(( EN_LINES - DE_LINES ))
DELTA=${DELTA#-}

if [ "$DELTA" -gt 30 ]; then
  echo "⚠  en.ts and de.ts differ by ${DELTA} lines — possible missing translations"
fi

echo "✓ i18n keys in sync ($(echo "$EN_KEYS" | wc -w | tr -d ' ') sections)"
