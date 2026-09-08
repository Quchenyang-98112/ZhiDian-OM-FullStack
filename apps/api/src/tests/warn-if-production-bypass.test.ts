/**
 * Tests for warnIfProductionBypass — detects dev-mode auth bypass with
 * production-shaped secrets present.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('warnIfProductionBypass', () => {
  const prevEnv = { ...process.env };
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    warnSpy.mockClear();
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SECRET;
    delete process.env.API_KEYS;
    delete process.env.WS_ORIGINS;
    delete process.env.CORS_ORIGINS;
  });

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  async function loadWarnIfProductionBypass() {
    vi.resetModules();
    const mod = await import('../middleware/auth.js');
    return mod.warnIfProductionBypass;
  }

  it('does not warn when no production-shaped secrets are set', async () => {
    const warnIfProductionBypass = await loadWarnIfProductionBypass();
    warnIfProductionBypass();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns when JWT_SECRET is set in development', async () => {
    process.env.JWT_SECRET = 'super-secret';
    const warnIfProductionBypass = await loadWarnIfProductionBypass();
    warnIfProductionBypass();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SECURITY WARNING'));
  });

  it('warns when API_KEYS is set in development', async () => {
    process.env.API_KEYS = 'key1';
    const warnIfProductionBypass = await loadWarnIfProductionBypass();
    warnIfProductionBypass();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SECURITY WARNING'));
  });

  it('warns when WS_ORIGINS is set in development', async () => {
    process.env.WS_ORIGINS = 'wss://example.com';
    const warnIfProductionBypass = await loadWarnIfProductionBypass();
    warnIfProductionBypass();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SECURITY WARNING'));
  });

  it('warns when CORS_ORIGINS is set in development', async () => {
    process.env.CORS_ORIGINS = 'https://example.com';
    const warnIfProductionBypass = await loadWarnIfProductionBypass();
    warnIfProductionBypass();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SECURITY WARNING'));
  });

  it('does not warn in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'super-secret';
    process.env.API_KEYS = 'key1';
    const warnIfProductionBypass = await loadWarnIfProductionBypass();
    warnIfProductionBypass();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
