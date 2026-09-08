import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock sentry before importing logger
vi.mock('../lib/sentry', () => ({
  Sentry: {
    captureException: vi.fn(),
    captureMessage: vi.fn(),
  },
  sentryEnabled: false,
}));

import { logger } from '../lib/logger';

describe('Logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('should log debug messages', () => {
    logger.debug('test debug', 'TestCtx');
    expect(console.debug).toHaveBeenCalled();
  });

  it('should log info messages', () => {
    logger.info('test info', 'TestCtx');
    expect(console.info).toHaveBeenCalled();
  });

  it('should log warn messages', () => {
    logger.warn('test warn', 'TestCtx');
    expect(console.warn).toHaveBeenCalled();
  });

  it('should log error messages', () => {
    logger.error('test error', new Error('boom'), 'TestCtx');
    expect(console.error).toHaveBeenCalled();
  });

  it('should log fatal messages via console.error', () => {
    logger.fatal('fatal crash', new Error('critical'), 'TestCtx');
    expect(console.error).toHaveBeenCalled();
  });

  it('should log with data parameter', () => {
    logger.info('with data', 'Ctx', { key: 'value' });
    expect(console.info).toHaveBeenCalled();
  });

  it('should log without context', () => {
    logger.info('no context');
    expect(console.info).toHaveBeenCalled();
  });

  it('should store entries in ring buffer', () => {
    logger.info('buffered message');
    const logs = logger.getRecentLogs();
    expect(logs.length).toBeGreaterThan(0);
    const last = logs[logs.length - 1];
    expect(last.message).toBe('buffered message');
    expect(last.level).toBe('info');
    expect(last.timestamp).toBeGreaterThan(0);
  });

  it('should create child loggers with fixed context', () => {
    const child = logger.child('Adapter');
    child.debug('child debug');
    child.info('child info');
    child.warn('child warn');
    child.error('child error', new Error('err'));
    child.fatal('child fatal', new Error('crit'));
    expect(console.debug).toHaveBeenCalled();
    expect(console.info).toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it('should include context in child logger entries', () => {
    const child = logger.child('MyComponent');
    child.info('hello');
    const logs = logger.getRecentLogs();
    const last = logs[logs.length - 1];
    expect(last.context).toBe('MyComponent');
  });

  it('should handle child logger with data', () => {
    const child = logger.child('DataCtx');
    child.info('msg', { extra: 42 });
    child.warn('warning', { level: 'high' });
    child.error('error', undefined, { code: 500 });
    expect(console.info).toHaveBeenCalled();
  });

  it('should emit JSON logs when ?log=json is present', () => {
    vi.stubGlobal('window', {
      location: { search: '?log=json', hostname: 'localhost' },
      localStorage: { getItem: () => null },
    });
    vi.resetModules();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // Re-import logger so detectJsonMode picks up the stubbed window
    return import('../lib/logger').then(({ logger: jsonLogger }) => {
      jsonLogger.info('json mode', 'JsonCtx');
      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
      vi.unstubAllGlobals();
    });
  });
});
