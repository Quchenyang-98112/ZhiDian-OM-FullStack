import { describe, expect, it } from 'vitest';
import { applySettingsSectionParam, resolveSettingsSection } from '../lib/settings-unified-url';

describe('settings-unified-url', () => {
  it('resolves valid section params', () => {
    expect(resolveSettingsSection('help')).toBe('help');
    expect(resolveSettingsSection('plugins')).toBe('plugins');
  });

  it('defaults to settings when section is missing or invalid', () => {
    expect(resolveSettingsSection(null)).toBe('settings');
    expect(resolveSettingsSection('bogus')).toBe('settings');
  });

  it('applies section params and clears tab when switching to plugins', () => {
    const base = new URLSearchParams('tab=energy');
    expect(applySettingsSectionParam(base, 'plugins').toString()).toBe('section=plugins');
    const helpParams = applySettingsSectionParam(new URLSearchParams('tab=energy'), 'help');
    expect(helpParams.get('section')).toBe('help');
    expect(helpParams.get('tab')).toBeNull();
    expect(
      applySettingsSectionParam(new URLSearchParams('section=help&tab=faq'), 'settings').toString(),
    ).toBe('');
    expect(
      applySettingsSectionParam(new URLSearchParams('section=help'), 'settings').toString(),
    ).toBe('');
  });
});
