/**
 * Build-time CSP helpers for the static `index.html` shell.
 *
 * The static meta CSP in `index.html` is the *effective* policy for the
 * GitHub Pages deployment (there is no Express server in front of it). The dev
 * server proxy needs localhost WebSocket origins in `connect-src`, but the
 * hosted production bundle must not ship them — they are unnecessary attack
 * surface and inconsistent with the hardened server policy (env-driven
 * `WS_ORIGINS`, see `apps/api/src/middleware/security.ts`).
 *
 * Only the dev server proxy needs these origins; every production build (E2E
 * preview and deploy alike) is a backendless static bundle, so dev builds keep
 * them and all production builds strip them.
 */

/** Matches `ws://localhost:*`, `wss://localhost:*`, `ws://127.0.0.1:*`, `wss://127.0.0.1:*` (with any leading whitespace). */
const LOCALHOST_WS_ORIGIN = /\s*wss?:\/\/(?:localhost|127\.0\.0\.1):\*/g;

/**
 * Remove dev-only localhost WebSocket origins from the HTML shell's CSP.
 * Idempotent and safe to run on HTML that contains no such origins.
 */
export function stripLocalhostWsOrigins(html: string): string {
  return html.replace(LOCALHOST_WS_ORIGIN, '');
}
