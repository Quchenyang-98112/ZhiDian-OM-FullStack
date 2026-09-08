import { describe, expect, it } from 'vitest';
import {
  applySettingsTabParam,
  DEFAULT_SETTINGS_TAB,
  resolveSettingsTab,
} from '../lib/settings-tab-url';

describe('settings-tab-url', () => {
  it('resolves valid tab params', () => {
    expect(resolveSettingsTab('adapters')).toBe('adapters');
    expect(resolveSettingsTab('energy')).toBe('energy');
  });

  it('falls back to appearance for missing or invalid tabs', () => {
    expect(resolveSettingsTab(null)).toBe(DEFAULT_SETTINGS_TAB);
    expect(resolveSettingsTab('not-a-tab')).toBe(DEFAULT_SETTINGS_TAB);
  });

  it('sets and clears tab params while preserving other keys', () => {
    const base = new URLSearchParams('section=help&tab=faq');
    expect(applySettingsTabParam(base, 'adapters').toString()).toBe('section=help&tab=adapters');
    expect(applySettingsTabParam(base, DEFAULT_SETTINGS_TAB).toString()).toBe('section=help');
  });
});
