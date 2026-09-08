import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getEffectiveAdapterMode,
  isLiveHardwareAllowed,
  isMockAdapterMode,
  logAdapterModeStartup,
  resolveAdapterMode,
} from '../config/adapter-mode.js';

describe('adapter-mode', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.ADAPTER_MODE;
    delete process.env.ALLOW_LIVE_HARDWARE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('defaults to mock when ADAPTER_MODE is unset', () => {
    expect(resolveAdapterMode()).toBe('mock');
    expect(getEffectiveAdapterMode()).toBe('mock');
    expect(isMockAdapterMode()).toBe(true);
    expect(isLiveHardwareAllowed()).toBe(false);
  });

  it('treats explicit mock as mock', () => {
    process.env.ADAPTER_MODE = 'mock';
    expect(resolveAdapterMode()).toBe('mock');
    expect(getEffectiveAdapterMode()).toBe('mock');
  });

  it('does not allow live hardware with only ADAPTER_MODE=live', () => {
    process.env.ADAPTER_MODE = 'live';
    expect(resolveAdapterMode()).toBe('live');
    expect(isLiveHardwareAllowed()).toBe(false);
    expect(getEffectiveAdapterMode()).toBe('mock');
  });

  it('allows live hardware only with double opt-in', () => {
    process.env.ADAPTER_MODE = 'live';
    process.env.ALLOW_LIVE_HARDWARE = 'true';
    expect(isLiveHardwareAllowed()).toBe(true);
    expect(getEffectiveAdapterMode()).toBe('live');
    expect(isMockAdapterMode()).toBe(false);
  });

  it('falls back to mock for invalid ADAPTER_MODE values', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.ADAPTER_MODE = 'production';
    expect(resolveAdapterMode()).toBe('mock');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('logs mock startup message by default', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(logAdapterModeStartup()).toBe('mock');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('ADAPTER_MODE=mock'));
    log.mockRestore();
  });

  it('warns when live is requested without ALLOW_LIVE_HARDWARE', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.ADAPTER_MODE = 'live';
    expect(logAdapterModeStartup()).toBe('mock');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ALLOW_LIVE_HARDWARE'));
    warn.mockRestore();
  });
});
