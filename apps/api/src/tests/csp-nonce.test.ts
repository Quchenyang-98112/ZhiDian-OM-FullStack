/**
 * csp-nonce.test.ts — AUD-02 production CSP directive helpers.
 */

import { describe, expect, it } from 'vitest';
import {
  buildProductionScriptSrc,
  buildProductionStyleSrc,
  extractCspNonceFromIndexHtml,
} from '../config/csp-nonce.js';

const SAMPLE_HTML = `<!doctype html>
<meta http-equiv="Content-Security-Policy" content="style-src 'self' 'nonce-abc123XYZ+/=';">
<style nonce="abc123XYZ+/=">body{}</style>`;

describe('extractCspNonceFromIndexHtml', () => {
  it('reads nonce from meta CSP', () => {
    expect(extractCspNonceFromIndexHtml(SAMPLE_HTML)).toBe('abc123XYZ+/=');
  });

  it('returns undefined when meta nonce is absent', () => {
    expect(extractCspNonceFromIndexHtml('<html></html>')).toBeUndefined();
  });
});

describe('buildProductionStyleSrc (AUD-02)', () => {
  it('drops unsafe-inline when build nonce is present', () => {
    expect(buildProductionStyleSrc('nonce-value')).toEqual(["'self'", "'nonce-nonce-value'"]);
  });

  it('fails closed to self-only (no unsafe-inline) without a build nonce', () => {
    // A missing nonce must NOT silently degrade to 'unsafe-inline' — that would
    // re-open the style-injection surface AUD-02 closed. Matches script-src.
    expect(buildProductionStyleSrc()).toEqual(["'self'"]);
  });
});

describe('buildProductionScriptSrc', () => {
  it('includes nonce when available', () => {
    expect(buildProductionScriptSrc('abc')).toEqual(["'self'", "'nonce-abc'"]);
  });

  it('is self-only without nonce', () => {
    expect(buildProductionScriptSrc()).toEqual(["'self'"]);
  });
});
