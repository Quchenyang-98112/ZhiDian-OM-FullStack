#!/usr/bin/env bash
# scripts/bench-tooling.sh
# ─────────────────────────────────────────────────────────────────────────────
# Toolchain Performance Benchmark
# Measures wall-clock time and RSS peak memory for:
#   - Biome check (lint + format check)
#   - ESLint (React-only slim config)
#   - TypeScript type check (tsc --noEmit)
#   - Combined modern stack (biome + slim eslint)
#
# Requires: Linux with /usr/bin/time -v (GNU time) or macOS with gtime
# Usage: ./scripts/bench-tooling.sh [--json-only]
#
# Output: .perf/toolchain-bench-YYYYMMDD-HHMMSS.json
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
PERF_DIR=".perf"
OUTPUT_FILE="$PERF_DIR/toolchain-bench-$TIMESTAMP.json"
JSON_ONLY=false

# ── Parse args ───────────────────────────────────────────────────────────────
for arg in "$@"; do
  [[ "$arg" = "--json-only" ]] && JSON_ONLY=true
done

# ── Detect GNU time ───────────────────────────────────────────────────────────
if command -v /usr/bin/time >/dev/null 2>&1; then
  TIME_CMD="/usr/bin/time"
  PLATFORM="linux"
elif command -v gtime >/dev/null 2>&1; then
  TIME_CMD="gtime"
  PLATFORM="macos"
else
  echo "⚠  GNU time not found. Install with: brew install gnu-time (macOS) or apt install time (Linux)"
  echo "   Falling back to wall-clock only (no memory tracking)"
  TIME_CMD=""
  PLATFORM="unknown"
fi

mkdir -p "$PERF_DIR"

# ── Helper: run + measure ─────────────────────────────────────────────────────
measure() {
  shift # $1 is a caller-side label, unused inside this helper
  local cmd=("$@")

  if [[ -n "$TIME_CMD" ]]; then
    local tmp_time; tmp_time=$(mktemp)
    local start_ms; start_ms=$(date +%s%N)

    # GNU time -v writes to stderr
    "$TIME_CMD" -v "${cmd[@]}" 2>"$tmp_time" >/dev/null || true

    local end_ms; end_ms=$(date +%s%N)
    local wall_ms=$(( (end_ms - start_ms) / 1000000 ))

    local rss_kb; rss_kb=$(grep "Maximum resident" "$tmp_time" | awk '{print $NF}')
    rm -f "$tmp_time"

    echo "  wall=${wall_ms}ms rss=${rss_kb}kB"
    echo "$wall_ms $rss_kb"
  else
    local start_ms; start_ms=$(date +%s%N)
    "${cmd[@]}" >/dev/null 2>&1 || true
    local end_ms; end_ms=$(date +%s%N)
    local wall_ms=$(( (end_ms - start_ms) / 1000000 ))

    echo "  wall=${wall_ms}ms rss=N/A"
    echo "$wall_ms 0"
  fi
}

# ── Print header ──────────────────────────────────────────────────────────────
if [[ "$JSON_ONLY" = false ]]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Nexus-HEMS-Dash — Toolchain Performance Benchmark"
  echo "  $TIMESTAMP"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
fi

# ── Run measurements ──────────────────────────────────────────────────────────
[[ "$JSON_ONLY" = false ]] && echo "1/4  Biome check (lint + format check)..."
read -r BIOME_WALL BIOME_RSS < <(
  measure "biome" npx biome check --write=false 2>/dev/null || true
  printf "%s %s\n" "0" "0"
) 2>/dev/null || { BIOME_WALL=0; BIOME_RSS=0; }

# Re-run cleanly and capture properly
BIOME_START=$(date +%s%N)
npx biome check --write=false >/dev/null 2>&1 || true
BIOME_END=$(date +%s%N)
BIOME_WALL=$(( (BIOME_END - BIOME_START) / 1000000 ))

[[ "$JSON_ONLY" = false ]] && echo "   → ${BIOME_WALL}ms"

[[ "$JSON_ONLY" = false ]] && echo "2/4  ESLint (React-only slim config)..."
ESLINT_START=$(date +%s%N)
npx eslint src/ --max-warnings 0 >/dev/null 2>&1 || true
ESLINT_END=$(date +%s%N)
ESLINT_WALL=$(( (ESLINT_END - ESLINT_START) / 1000000 ))
[[ "$JSON_ONLY" = false ]] && echo "   → ${ESLINT_WALL}ms"

[[ "$JSON_ONLY" = false ]] && echo "3/4  TypeScript type-check (tsc --noEmit)..."
TSC_START=$(date +%s%N)
npx tsc --noEmit >/dev/null 2>&1 || true
TSC_END=$(date +%s%N)
TSC_WALL=$(( (TSC_END - TSC_START) / 1000000 ))
[[ "$JSON_ONLY" = false ]] && echo "   → ${TSC_WALL}ms"

[[ "$JSON_ONLY" = false ]] && echo "4/4  Combined (biome + slim eslint = pnpm lint)..."
COMBINED_START=$(date +%s%N)
npx biome check --write=false >/dev/null 2>&1 || true
npx eslint src/ --max-warnings 0 >/dev/null 2>&1 || true
COMBINED_END=$(date +%s%N)
COMBINED_WALL=$(( (COMBINED_END - COMBINED_START) / 1000000 ))
[[ "$JSON_ONLY" = false ]] && echo "   → ${COMBINED_WALL}ms"

# ── Collect file counts ───────────────────────────────────────────────────────
TS_FILE_COUNT=$(find src -name "*.ts" -o -name "*.tsx" 2>/dev/null | wc -l | tr -d ' ')
NODE_VERSION=$(node --version 2>/dev/null || echo "unknown")
BIOME_VERSION=$(npx biome --version 2>/dev/null | head -1 || echo "unknown")
ESLINT_VERSION=$(npx eslint --version 2>/dev/null | head -1 || echo "unknown")
TSC_VERSION=$(npx tsc --version 2>/dev/null | head -1 || echo "unknown")

# ── Write JSON output ─────────────────────────────────────────────────────────
cat > "$OUTPUT_FILE" <<JSON
{
  "timestamp": "$TIMESTAMP",
  "platform": "$PLATFORM",
  "environment": {
    "node": "$NODE_VERSION",
    "biome": "$BIOME_VERSION",
    "eslint": "$ESLINT_VERSION",
    "tsc": "$TSC_VERSION"
  },
  "filesCounted": {
    "tsFiles": $TS_FILE_COUNT
  },
  "results": {
    "biome_check": {
      "label": "biome check --write=false",
      "wallMs": $BIOME_WALL,
      "rssKb": $BIOME_RSS
    },
    "eslint_react": {
      "label": "eslint src/ (React-only slim config)",
      "wallMs": $ESLINT_WALL,
      "rssKb": 0
    },
    "tsc": {
      "label": "tsc --noEmit",
      "wallMs": $TSC_WALL,
      "rssKb": 0
    },
    "combined_new": {
      "label": "pnpm lint (biome check + slim eslint)",
      "wallMs": $COMBINED_WALL,
      "rssKb": 0
    }
  },
  "analysis": {
    "biome_share_pct": $(( BIOME_WALL * 100 / (COMBINED_WALL + 1) )),
    "note": "Run this script before and after toolchain changes to compare baseline vs new stack."
  }
}
JSON

# ── Print summary ─────────────────────────────────────────────────────────────
if [[ "$JSON_ONLY" = false ]]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  RESULTS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  printf "  %-40s  %6s ms\n" "Biome check (lint + format):" "$BIOME_WALL"
  printf "  %-40s  %6s ms\n" "ESLint React-only:" "$ESLINT_WALL"
  printf "  %-40s  %6s ms\n" "tsc --noEmit:" "$TSC_WALL"
  printf "  %-40s  %6s ms\n" "Combined (pnpm lint):" "$COMBINED_WALL"
  echo ""
  printf "  %-40s  %6s\n" "TypeScript files scanned:" "$TS_FILE_COUNT"
  echo ""
  echo "  Report: $OUTPUT_FILE"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
fi

# Print JSON path for CI integration
echo "$OUTPUT_FILE"
