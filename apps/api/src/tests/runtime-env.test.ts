import { describe, expect, it, vi } from 'vitest';
import { isDevRuntime, isProductionRuntime, warnIfNodeEnvUnset } from '../config/runtime-env.js';

describe('runtime-env (SEC-11)', () => {
  it('treats development and test as dev runtime', () => {
    expect(isDevRuntime({ NODE_ENV: 'development' })).toBe(true);
    expect(isDevRuntime({ NODE_ENV: 'test' })).toBe(true);
  });

  it('treats unset NODE_ENV as production-hardened', () => {
    expect(isDevRuntime({})).toBe(false);
    expect(isProductionRuntime({})).toBe(true);
  });

  it('treats production as production-hardened', () => {
    expect(isDevRuntime({ NODE_ENV: 'production' })).toBe(false);
    expect(isProductionRuntime({ NODE_ENV: 'production' })).toBe(true);
  });

  it('warns when NODE_ENV is unset', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnIfNodeEnvUnset({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('SEC-11'));
    warn.mockRestore();
  });

  it('does not warn when NODE_ENV is set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnIfNodeEnvUnset({ NODE_ENV: 'development' });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
