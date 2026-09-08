import { describe, expect, it } from 'vitest';
import {
  bumpSyncVersion,
  getSyncVersion,
  resetSyncVersionForTests,
} from '../data/sync-version-store.js';

describe('sync-version-store', () => {
  it('returns a strictly increasing version after consecutive bumps', async () => {
    resetSyncVersionForTests(100);
    expect(await getSyncVersion()).toBe(100);
    const first = await bumpSyncVersion();
    const second = await bumpSyncVersion();
    expect(first).toBeGreaterThan(100);
    expect(second).toBeGreaterThan(first);
    expect(await getSyncVersion()).toBe(second);
  });
});
