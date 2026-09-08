/**
 * tauri-csp.test.ts — AUD-02 phase 2 Tauri production CSP builder.
 */

import { describe, expect, it } from 'vitest';
import {
  buildTauriProductionCsp,
  extractCspNonceFromIndexHtml,
  isTauriProductionCsp,
  TAURI_DEV_CSP,
} from '../../tauri-csp';

describe('extractCspNonceFromIndexHtml (Tauri)', () => {
  it('extracts nonce from meta CSP', () => {
    const html =
      '<meta http-equiv="Content-Security-Policy" content="style-src \'self\' \'nonce-abc123XYZ\'">';
    expect(extractCspNonceFromIndexHtml(html)).toBe('abc123XYZ');
  });
});

describe('buildTauriProductionCsp (AUD-02 phase 2)', () => {
  const nonce = 'testNonceBase64==';
  const csp = buildTauriProductionCsp(nonce);

  it('includes script and style nonces', () => {
    expect(csp).toContain(`script-src 'self' 'nonce-${nonce}'`);
    expect(csp).toContain(`style-src 'self' 'nonce-${nonce}'`);
  });

  it('omits style-src unsafe-inline (style-src-attr may retain it)', () => {
    const styleSrc = csp.split(';').find((d) => d.trim().startsWith('style-src ')) ?? '';
    expect(styleSrc).not.toContain("'unsafe-inline'");
  });

  it('allows Radix/motion via style-src-attr', () => {
    expect(csp).toContain("style-src-attr 'unsafe-inline'");
  });

  it('passes isTauriProductionCsp', () => {
    expect(isTauriProductionCsp(csp)).toBe(true);
    expect(isTauriProductionCsp(TAURI_DEV_CSP)).toBe(false);
  });
});
