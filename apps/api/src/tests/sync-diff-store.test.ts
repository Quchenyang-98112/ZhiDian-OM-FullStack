import { afterEach, describe, expect, it } from 'vitest';
import { resetServerSettingsForTests } from '../data/settings-store.js';
import {
  getSyncDiffSince,
  recordSyncDiffEntry,
  resetSyncDiffForTests,
} from '../data/sync-diff-store.js';
import { getSyncVersion, resetSyncVersionForTests } from '../data/sync-version-store.js';

describe('sync-diff-store', () => {
  afterEach(() => {
    resetSyncDiffForTests();
    resetServerSettingsForTests();
    resetSyncVersionForTests(100);
  });

  it('records changes with monotonically increasing versions', async () => {
    resetSyncVersionForTests(100);
    const v1 = await recordSyncDiffEntry('theme', 'dark', 'userPreferences', 1000);
    const v2 = await recordSyncDiffEntry('victronIp', '10.0.0.1', 'deviceSettings', 1001);

    expect(v2).toBeGreaterThan(v1);
    expect(await getSyncVersion()).toBe(v2);
  });

  it('returns only entries newer than since', async () => {
    resetSyncVersionForTests(50);
    await recordSyncDiffEntry('animations', true, 'userPreferences');
    const mid = await getSyncVersion();
    await recordSyncDiffEntry('knxIp', '192.168.1.2', 'deviceSettings');

    const diff = await getSyncDiffSince(mid);
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0]?.key).toBe('knxIp');
    expect(diff.version).toBe(await getSyncVersion());
  });
});
