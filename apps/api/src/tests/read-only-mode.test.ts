import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isReadOnlyMode, logReadOnlyModeStartup } from '../config/read-only-mode.js';

describe('read-only-mode', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment
    delete process.env.READ_ONLY_MODE;
  });

  afterEach(() => {
    // Restore original environment
    process.env.READ_ONLY_MODE = originalEnv.READ_ONLY_MODE;
  });

  describe('isReadOnlyMode', () => {
    it('returns false when READ_ONLY_MODE is not set', () => {
      expect(isReadOnlyMode()).toBe(false);
    });

    it('returns false when READ_ONLY_MODE is set to "false"', () => {
      process.env.READ_ONLY_MODE = 'false';
      expect(isReadOnlyMode()).toBe(false);
    });

    it('returns false when READ_ONLY_MODE is set to "FALSE"', () => {
      process.env.READ_ONLY_MODE = 'FALSE';
      expect(isReadOnlyMode()).toBe(false);
    });

    it('returns true when READ_ONLY_MODE is set to "true"', () => {
      process.env.READ_ONLY_MODE = 'true';
      expect(isReadOnlyMode()).toBe(true);
    });

    it('returns true when READ_ONLY_MODE is set to "TRUE"', () => {
      process.env.READ_ONLY_MODE = 'TRUE';
      expect(isReadOnlyMode()).toBe(true);
    });

    it('returns true when READ_ONLY_MODE has whitespace', () => {
      process.env.READ_ONLY_MODE = '  true  ';
      expect(isReadOnlyMode()).toBe(true);
    });
  });

  describe('logReadOnlyModeStartup', () => {
    it('logs when read-only mode is enabled', () => {
      process.env.READ_ONLY_MODE = 'true';
      const consoleSpy = {
        log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      };

      logReadOnlyModeStartup();

      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('READ_ONLY_MODE=true'));
      consoleSpy.log.mockRestore();
    });

    it('does not log when read-only mode is disabled', () => {
      process.env.READ_ONLY_MODE = 'false';
      const consoleSpy = {
        log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      };

      logReadOnlyModeStartup();

      expect(consoleSpy.log).not.toHaveBeenCalled();
      consoleSpy.log.mockRestore();
    });
  });
});
