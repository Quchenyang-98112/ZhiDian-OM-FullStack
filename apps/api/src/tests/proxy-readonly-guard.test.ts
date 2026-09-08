import { describe, expect, it, vi } from 'vitest';
import { rejectProxyIfReadOnly } from '../ws/proxy-readonly-guard.js';

describe('rejectProxyIfReadOnly', () => {
  it('closes with 4403 when READ_ONLY_MODE is active', () => {
    const original = process.env.READ_ONLY_MODE;
    process.env.READ_ONLY_MODE = 'true';
    const close = vi.fn();
    const clientWs = { close } as never;

    expect(rejectProxyIfReadOnly(clientWs)).toBe(true);
    expect(close).toHaveBeenCalledWith(
      4403,
      'System is in read-only mode — control commands are disabled',
    );

    if (original === undefined) delete process.env.READ_ONLY_MODE;
    else process.env.READ_ONLY_MODE = original;
  });

  it('returns false when read-only mode is off', () => {
    const original = process.env.READ_ONLY_MODE;
    delete process.env.READ_ONLY_MODE;
    const close = vi.fn();
    const clientWs = { close } as never;

    expect(rejectProxyIfReadOnly(clientWs)).toBe(false);
    expect(close).not.toHaveBeenCalled();

    if (original === undefined) delete process.env.READ_ONLY_MODE;
    else process.env.READ_ONLY_MODE = original;
  });
});
