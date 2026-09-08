import { afterEach, describe, expect, it, vi } from 'vitest';
import { logTrustProxyWarning, resolveTrustProxy } from '../config/trust-proxy.js';

describe('resolveTrustProxy', () => {
  const originalTrustProxy = process.env.TRUST_PROXY;

  afterEach(() => {
    if (originalTrustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = originalTrustProxy;
  });

  it('defaults to 1 when unset', () => {
    delete process.env.TRUST_PROXY;
    expect(resolveTrustProxy()).toBe(1);
  });

  it('parses numeric hops', () => {
    process.env.TRUST_PROXY = '2';
    expect(resolveTrustProxy()).toBe(2);
  });

  it('parses boolean strings', () => {
    process.env.TRUST_PROXY = 'true';
    expect(resolveTrustProxy()).toBe(true);
    process.env.TRUST_PROXY = 'false';
    expect(resolveTrustProxy()).toBe(false);
  });

  it('parses comma-separated subnet list', () => {
    process.env.TRUST_PROXY = 'loopback,10.0.0.0/8';
    expect(resolveTrustProxy()).toEqual(['loopback', '10.0.0.0/8']);
  });
});

describe('logTrustProxyWarning', () => {
  const originalTrustProxy = process.env.TRUST_PROXY;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalTrustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = originalTrustProxy;
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  it('warns once in production when TRUST_PROXY is unset', () => {
    delete process.env.TRUST_PROXY;
    process.env.NODE_ENV = 'production';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logTrustProxyWarning();
    logTrustProxyWarning(); // second call should be no-op due to dedup

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]![0]).toContain('TRUST_PROXY is not set');
  });

  it('does not warn when TRUST_PROXY is set in production', () => {
    process.env.TRUST_PROXY = '2';
    process.env.NODE_ENV = 'production';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logTrustProxyWarning();

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not warn outside production', () => {
    delete process.env.TRUST_PROXY;
    process.env.NODE_ENV = 'development';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logTrustProxyWarning();

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
