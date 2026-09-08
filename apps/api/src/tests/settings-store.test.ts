import { afterEach, describe, expect, it } from 'vitest';
import { applySettingsPatch, resetServerSettingsForTests } from '../data/settings-store.js';
import { getSyncDiffSince, resetSyncDiffForTests } from '../data/sync-diff-store.js';
import { resetSyncVersionForTests } from '../data/sync-version-store.js';

describe('settings-store', () => {
  afterEach(() => {
    resetServerSettingsForTests();
    resetSyncDiffForTests();
    resetSyncVersionForTests(10);
  });

  it('applies a patch and records diff entries', async () => {
    const result = await applySettingsPatch({ animations: false, victronIp: '10.0.0.5' }, 5000);

    expect(result.applied).toEqual(['animations', 'victronIp']);
    expect(result.version).toBeGreaterThan(10);

    const diff = await getSyncDiffSince(10);
    expect(diff.changes).toHaveLength(2);
    expect(diff.changes[0]?.category).toBe('userPreferences');
    expect(diff.changes[1]?.category).toBe('deviceSettings');
  });
});
