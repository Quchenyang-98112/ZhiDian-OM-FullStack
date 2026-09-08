import { describe, expect, it } from 'vitest';
import { sanitizePersistedSettings } from '../core/stored-settings-schema';

describe('sanitizePersistedSettings', () => {
  it('returns validated partial settings', () => {
    expect(sanitizePersistedSettings({ victronIp: '10.0.0.2', historyDays: 7 })).toEqual({
      victronIp: '10.0.0.2',
      historyDays: 7,
    });
  });

  it('strips unknown keys while keeping valid fields', () => {
    expect(sanitizePersistedSettings({ evil: true, victronIp: '10.0.0.1' })).toEqual({
      victronIp: '10.0.0.1',
    });
  });

  it('rejects invalid field types', () => {
    expect(sanitizePersistedSettings({ wsPort: 'bad' })).toEqual({});
  });
});
