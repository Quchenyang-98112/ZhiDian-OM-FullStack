/**
 * Extract the Vite build-time CSP nonce from production index.html.
 * Shared between Express Helmet and operational tooling.
 */
export function extractCspNonceFromIndexHtml(html: string): string | undefined {
  const match = html.match(/'nonce-([^']+)'/);
  return match?.[1];
}

/**
 * Production style-src when a build nonce is available (AUD-02).
 *
 * Fail-closed: if the nonce cannot be extracted we return `['self']` rather than
 * degrading to `'unsafe-inline'`. A silent `'unsafe-inline'` fallback would
 * re-open the style-injection surface AUD-02 closed; `['self']` matches the
 * script-src fallback and turns a misconfiguration into a visible failure (the
 * build-time inline `<style nonce>` block is blocked) instead of a security
 * downgrade. React/motion inline styles are set via the CSSOM and are unaffected
 * by style-src.
 */
export function buildProductionStyleSrc(buildNonce?: string): string[] {
  if (!buildNonce) return ["'self'"];
  return ["'self'", `'nonce-${buildNonce}'`];
}

/** Production script-src when a build nonce is available (AUD-02). */
export function buildProductionScriptSrc(buildNonce?: string): string[] {
  if (!buildNonce) return ["'self'"];
  return ["'self'", `'nonce-${buildNonce}'`];
}
