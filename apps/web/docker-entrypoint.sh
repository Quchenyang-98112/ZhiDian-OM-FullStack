#!/bin/sh
# MED-03 / AUD-02: Validate WS_ORIGINS and inject CSP_NONCE before nginx starts.
# WS_ORIGINS is injected into the nginx CSP connect-src header via envsubst.
# CSP_NONCE is read from the baked index.html (vite cspNoncePlugin) for
# script-src/style-src nonce directives — no 'unsafe-inline' in production.
# A malformed value would produce an invalid CSP header — potentially opening
# an XSS vector or silently breaking all WebSocket connectivity.
#
# Pattern: one or more space-separated wss?:// origins, each consisting of
# alphanumeric characters, dots, hyphens, underscores, colons, and brackets
# (for IPv6). No semicolons, quotes, or shell metacharacters permitted.
set -eu

WS_ORIGINS="${WS_ORIGINS:-}"

if [ -n "$WS_ORIGINS" ]; then
  # Validate every token in the space-separated list
  for origin in $WS_ORIGINS; do
    case "$origin" in
      # nosemgrep: javascript.lang.security.detect-insecure-websocket.detect-insecure-websocket
      ws://*|wss://*)
        # Strip scheme and check the remainder for safe characters only
        # nosemgrep: javascript.lang.security.detect-insecure-websocket.detect-insecure-websocket
        host="${origin#ws://}"
        # nosemgrep: javascript.lang.security.detect-insecure-websocket.detect-insecure-websocket
        host="${host#wss://}"
        case "$host" in
          *[!A-Za-z0-9._:\[\]-]*)
            echo "[entrypoint] ERROR: WS_ORIGINS contains invalid characters in: $origin" >&2
            echo "[entrypoint] Only alphanumeric, dots, hyphens, underscores, colons, and brackets are allowed." >&2
            exit 1
            ;;
        esac
        ;;
      *)
        # nosemgrep: javascript.lang.security.detect-insecure-websocket.detect-insecure-websocket
        echo "[entrypoint] ERROR: WS_ORIGINS entry does not start with ws:// or wss://: $origin" >&2
        exit 1
        ;;
    esac
  done
fi

# AUD-02: Extract build-time CSP nonce from the production index.html shell.
INDEX_HTML="${INDEX_HTML:-/usr/share/nginx/html/index.html}"
if [ -f "$INDEX_HTML" ]; then
  CSP_NONCE=$(grep -o "nonce-[A-Za-z0-9+/=_-]*" "$INDEX_HTML" | head -1 | sed 's/^nonce-//')
  if [ -z "$CSP_NONCE" ]; then
    echo "[entrypoint] ERROR: Could not extract CSP nonce from $INDEX_HTML" >&2
    exit 1
  fi
  case "$CSP_NONCE" in
    *[!A-Za-z0-9+/=_-]*)
      echo "[entrypoint] ERROR: CSP nonce contains invalid characters" >&2
      exit 1
      ;;
  esac
  export CSP_NONCE
else
  echo "[entrypoint] ERROR: index.html not found at $INDEX_HTML" >&2
  exit 1
fi

# Hand off to the nginx-unprivileged base image entrypoint, which runs
# envsubst on /etc/nginx/templates/*.template before starting nginx.
exec /docker-entrypoint.sh "$@"
