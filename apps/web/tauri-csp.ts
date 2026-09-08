/**
 * Tauri desktop CSP helpers (AUD-02 phase 2).
 *
 * Production `tauri build` syncs a nonce-aligned policy from the Vite-built
 * `dist/index.html` shell. `style-src-attr 'unsafe-inline'` remains for Radix /
 * motion runtime positioning attributes — not script execution risk.
 */

/** Dev/default CSP — keeps `unsafe-inline` for Vite HMR during `tauri dev`. */
export const TAURI_DEV_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://api.open-meteo.com https://api.tibber.com https://api.awattar.de https://api.awattar.at https://api.octopus.energy https://generativelanguage.googleapis.com https://api.openai.com https://api.anthropic.com https://api.x.ai https://api.groq.com wss:; font-src 'self'";

export function extractCspNonceFromIndexHtml(html: string): string | undefined {
  const match = html.match(/'nonce-([^']+)'/);
  return match?.[1];
}

/** Nonce-aligned production CSP for Tauri WebView (no style-src unsafe-inline). */
export function buildTauriProductionCsp(nonce: string): string {
  const n = `'nonce-${nonce}'`;
  return [
    "default-src 'self'",
    `script-src 'self' ${n}`,
    `style-src 'self' ${n}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self' https://api.open-meteo.com https://api.tibber.com https://api.awattar.de https://api.awattar.at https://api.octopus.energy https://generativelanguage.googleapis.com https://api.openai.com https://api.anthropic.com https://api.x.ai https://api.groq.com wss:",
    "font-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

/** True when production CSP drops style-src unsafe-inline and uses build nonce. */
export function isTauriProductionCsp(csp: string): boolean {
  const directives = csp.split(';').map((d) => d.trim());
  const styleSrc = directives.find((d) => d.startsWith('style-src '));
  const styleSrcAttr = directives.find((d) => d.startsWith('style-src-attr '));
  if (!styleSrc || !styleSrcAttr) return false;
  if (styleSrc.includes("'unsafe-inline'")) return false;
  if (!/'nonce-/.test(styleSrc)) return false;
  return styleSrcAttr.includes("'unsafe-inline'");
}
