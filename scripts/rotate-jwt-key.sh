#!/usr/bin/env bash
# ── JWT Key Rotation Script ─────────────────────────────────────────
# Zero-downtime dual-key rotation for Nexus-HEMS-Dash.
#
# Procedure:
#   Step 1:  Add JWT_SECRET_NEW to .env.prod / Docker secrets
#            → New tokens use JWT_SECRET_NEW; old tokens still verified via JWT_SECRET
#   Step 2:  Wait 24 h for all old tokens to expire naturally
#   Step 3:  Run this script to promote JWT_SECRET_NEW → JWT_SECRET and clear the NEW key
#   Step 4:  Restart server (or rolling restart in K8s)
#
# Dependencies:
#   - openssl (for key generation)
#   - kubectl OR docker compose (for secret injection)
#
# Usage:
#   ./scripts/rotate-jwt-key.sh                    # generate new key, print instructions
#   ./scripts/rotate-jwt-key.sh --apply            # generate + apply to .env.prod (local dev)
#   ./scripts/rotate-jwt-key.sh --kubernetes       # generate + apply via kubectl Secret
#   NEXUS_NAMESPACE=nexus-prod ./scripts/rotate-jwt-key.sh --kubernetes
#
# Security notes:
#   - Never log or print the generated secret
#   - Use env variable injection, not shell argument
#   - The new secret is only stored in memory until written to the target

set -euo pipefail

# ─── Configuration ─────────────────────────────────────────────────
NEXUS_NAMESPACE="${NEXUS_NAMESPACE:-nexus-hems}"
K8S_SECRET_NAME="${K8S_SECRET_NAME:-nexus-hems-jwt}"
ENV_FILE="${ENV_FILE:-.env.prod}"
KEY_BYTES="${KEY_BYTES:-64}"  # 64 bytes = 512-bit secret (recommended for HS256)

# ─── Argument parsing ────────────────────────────────────────────────
APPLY_LOCAL=false
APPLY_K8S=false
for arg in "$@"; do
  case "$arg" in
    --apply)      APPLY_LOCAL=true ;;
    --kubernetes) APPLY_K8S=true ;;
    --help|-h)
      grep '^#' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg. Use --apply, --kubernetes, or --help." >&2
      exit 1
      ;;
  esac
done

# ─── Generate new secret ────────────────────────────────────────────
NEW_SECRET="$(openssl rand -hex "$KEY_BYTES")"

# Validate generated length (openssl rand -hex N produces 2N hex chars)
EXPECTED_LEN=$(( KEY_BYTES * 2 ))
if [[ ${#NEW_SECRET} -ne $EXPECTED_LEN ]]; then
  echo "ERROR: Generated secret has unexpected length. Expected $EXPECTED_LEN, got ${#NEW_SECRET}." >&2
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Nexus-HEMS JWT Key Rotation Script"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "New key generated: ${KEY_BYTES}-byte cryptographically random secret"
echo "(secret will not be printed — stored directly in target)"
echo ""

# ─── Apply to .env.prod (local --apply) ─────────────────────────────
if [[ "$APPLY_LOCAL" = "true" ]]; then
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "ERROR: $ENV_FILE not found. Create it first from .env.prod.example" >&2
    exit 1
  fi

  # Check if JWT_SECRET_NEW already exists — warn and overwrite
  if grep -q "^JWT_SECRET_NEW=" "$ENV_FILE"; then
    echo "WARNING: JWT_SECRET_NEW already set in $ENV_FILE — overwriting with new value"
    # Use sed to update in-place (macOS compatible with -i '')
    sed -i.bak "s|^JWT_SECRET_NEW=.*|JWT_SECRET_NEW=${NEW_SECRET}|" "$ENV_FILE" && rm "${ENV_FILE}.bak"
  else
    echo "JWT_SECRET_NEW=${NEW_SECRET}" >> "$ENV_FILE"
  fi

  echo "✅ JWT_SECRET_NEW written to $ENV_FILE"
  echo ""
  echo "NEXT STEPS:"
  echo "  1. Restart the server: docker compose up -d nexus-server"
  echo "  2. Wait 24 hours for old tokens to expire"
  echo "  3. Promote: JWT_SECRET=\$(grep JWT_SECRET_NEW $ENV_FILE | cut -d= -f2)"
  echo "              Then remove JWT_SECRET_NEW from $ENV_FILE"
  echo "  4. Restart server again"
  exit 0
fi

# ─── Apply to Kubernetes Secret (--kubernetes) ───────────────────────
if [[ "$APPLY_K8S" = "true" ]]; then
  if ! command -v kubectl &>/dev/null; then
    echo "ERROR: kubectl not found in PATH" >&2
    exit 1
  fi

  echo "Patching Kubernetes Secret $K8S_SECRET_NAME in namespace $NEXUS_NAMESPACE..."

  # Encode the new secret for the patch
  NEW_SECRET_B64="$(echo -n "$NEW_SECRET" | base64 | tr -d '\n')"

  kubectl patch secret "$K8S_SECRET_NAME" \
    -n "$NEXUS_NAMESPACE" \
    --type=merge \
    -p "{\"data\":{\"JWT_SECRET_NEW\":\"${NEW_SECRET_B64}\"}}"

  echo "✅ JWT_SECRET_NEW patched in Kubernetes Secret $K8S_SECRET_NAME"
  echo ""
  echo "NEXT STEPS:"
  echo "  1. Trigger rolling restart: kubectl rollout restart deployment/nexus-server -n $NEXUS_NAMESPACE"
  echo "  2. Wait 24 hours for all in-flight tokens to expire naturally"
  echo "  3. Promote key:"
  echo "     - Copy JWT_SECRET_NEW value to JWT_SECRET in the same Secret"
  echo "     - Remove JWT_SECRET_NEW from the Secret"
  echo "     kubectl patch secret $K8S_SECRET_NAME -n $NEXUS_NAMESPACE \\"
  echo "       --type=merge -p '{\"data\":{\"JWT_SECRET_NEW\":null}}'"
  echo "  4. Trigger another rolling restart"
  exit 0
fi

# ─── Dry-run: print instructions ────────────────────────────────────
echo "DRY RUN — No changes applied."
echo ""
echo "To apply the new key, run one of:"
echo "  $0 --apply           # write to $ENV_FILE (local dev)"
echo "  $0 --kubernetes      # patch Kubernetes Secret (K8s deployment)"
echo ""
echo "Manual procedure:"
echo "  1. Add JWT_SECRET_NEW=<new 128-char hex> to your deployment secrets"
echo "     (use: openssl rand -hex 64)"
echo "  2. Restart server"
echo "  3. Wait 24 h for old tokens to expire"
echo "  4. Replace JWT_SECRET with new value; remove JWT_SECRET_NEW"
echo "  5. Restart server again"
