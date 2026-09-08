import { describe, expect, it } from 'vitest';
import { applyHelpTabParam, resolveHelpTab } from '../lib/help-tab-url';

describe('help-tab-url', () => {
  it('resolves valid help tabs', () => {
    expect(resolveHelpTab('faq')).toBe('faq');
    expect(resolveHelpTab(null)).toBe('getting-started');
  });

  it('preserves section=help when embedded', () => {
    const base = new URLSearchParams('section=help&tab=getting-started');
    expect(applyHelpTabParam(base, 'faq', { embedded: true }).toString()).toBe(
      'section=help&tab=faq',
    );
  });

  it('does not add section when standalone', () => {
    const base = new URLSearchParams();
    expect(applyHelpTabParam(base, 'faq').toString()).toBe('tab=faq');
    expect(applyHelpTabParam(base, 'getting-started').toString()).toBe('');
  });
});
