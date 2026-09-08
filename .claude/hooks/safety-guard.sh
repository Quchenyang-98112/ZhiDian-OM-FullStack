#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Claude Code PreToolUse guard for safety-critical / secret paths.
#
# Wired from .claude/settings.json on the Edit|Write matcher. Reads the tool-call
# JSON on stdin and emits a hookSpecificOutput decision:
#
#   Tier 1 (permissionDecision "ask") — hard guardrails + secrets:
#     command-safety.ts, circuit-breaker.ts, jwt-utils.ts, read-only-mode.ts,
#     energy.ws.ts, any .env*, and lock files. These control hardware command
#     dispatch, auth, rate limits, and read-only enforcement, so per CLAUDE.md
#     ("never auto-apply fixes to control logic … surface for human review")
#     the edit is paused for explicit confirmation.
#
#   Tier 2 (additionalContext) — adapter / backend protocol code:
#     apps/web/src/core/adapters/**, apps/api/src/protocols/**. Editing is
#     allowed but flagged so the contract (EnergyAdapter / IProtocolAdapter),
#     Zod validation, circuit breaker, and tests stay intact.
#
# Always exits 0 — a guard must never block the tool pipeline on its own error.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

input="$(cat 2>/dev/null || true)"

# Fail closed if jq is missing: without it the guard cannot parse the tool input,
# so surface the edit for review instead of silently allowing a Tier-1 change.
if ! command -v jq >/dev/null 2>&1; then
  printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"safety-guard: jq is not installed, so the guard cannot verify whether this edit targets a safety-critical or secret file. Install jq, or confirm this edit is intended before applying."}}'
  exit 0
fi

f="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)"
[ -z "$f" ] && exit 0

# Tier 1 — control logic, auth, rate limits, read-only enforcement, secrets.
if printf '%s' "$f" | grep -qE '(^|/)(command-safety|circuit-breaker|jwt-utils|read-only-mode|energy\.ws)\.ts$|(^|/)\.env($|\.)|-lock\.(json|yaml)$|Cargo\.lock$'; then
  jq -cn --arg r "Safety-critical / secret file: ${f}. Per CLAUDE.md, never auto-apply fixes to control logic, auth, rate limits, or safety guardrails — confirm this edit is intended and surface it for human review before applying." \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$r}}'
  exit 0
fi

# Tier 2 — frontend adapters / backend protocol adapters: allowed, flag for care.
if printf '%s' "$f" | grep -qE '/core/adapters/|/api/src/protocols/'; then
  jq -cn --arg c "⚠️ Adapter/protocol code: ${f}. This drives safety-critical hardware. Keep the EnergyAdapter/IProtocolAdapter contract, Zod validation, and circuit-breaker logic intact; add or adjust tests; do not silently change command dispatch." \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$c}}'
  exit 0
fi

exit 0
