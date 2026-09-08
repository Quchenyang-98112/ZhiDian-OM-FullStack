import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  invalidateExecConfigCache,
  listAvailableScripts,
  runCommandScript,
  runScript,
} from '../services/ExecService.js';

describe('ExecService', () => {
  const originalConfig = process.env.EXEC_SCRIPTS_CONFIG;

  beforeEach(() => {
    invalidateExecConfigCache();
    process.env.EXEC_SCRIPTS_CONFIG = JSON.stringify({
      scripts: {
        read_meter: {
          command: 'node',
          commandArgs: [
            '-e',
            "console.log(JSON.stringify({readings:[{metric:'POWER_W',value:1500,role:'pv'}]}))",
          ],
          allowedArgs: ['--device'],
          timeoutMs: 1000,
        },
      },
    });
  });

  afterEach(() => {
    invalidateExecConfigCache();
    if (originalConfig === undefined) delete process.env.EXEC_SCRIPTS_CONFIG;
    else process.env.EXEC_SCRIPTS_CONFIG = originalConfig;
  });

  it('rejects unknown script IDs', async () => {
    await expect(runScript({ scriptId: 'not_whitelisted' })).rejects.toThrow(/whitelist/);
  });

  it('rejects unsafe argument keys', async () => {
    await expect(runScript({ scriptId: 'read_meter', args: { '$(rm -rf)': 'x' } })).rejects.toThrow(
      /Unsafe argument key/,
    );
  });

  it('rejects disallowed argument keys for a script', async () => {
    await expect(runScript({ scriptId: 'read_meter', args: { '--port': '502' } })).rejects.toThrow(
      /not allowed/,
    );
  });

  it('lists configured script IDs', () => {
    const ids = listAvailableScripts().map((s) => s.id);
    expect(ids).toContain('read_meter');
  });

  it('runs a whitelisted script and parses JSON output', async () => {
    const output = await runScript({ scriptId: 'read_meter' });
    expect(output.readings[0]?.value).toBe(1500);
  });

  describe('runCommandScript — READ_ONLY_MODE guard', () => {
    const originalReadOnly = process.env.READ_ONLY_MODE;

    afterEach(() => {
      if (originalReadOnly === undefined) delete process.env.READ_ONLY_MODE;
      else process.env.READ_ONLY_MODE = originalReadOnly;
    });

    it('blocks command scripts when READ_ONLY_MODE is active', async () => {
      process.env.READ_ONLY_MODE = 'true';
      const result = await runCommandScript({ scriptId: 'read_meter', commandType: 'SET_X' });
      expect(result.success).toBe(false);
    });

    it('runs command scripts when READ_ONLY_MODE is off', async () => {
      delete process.env.READ_ONLY_MODE;
      const result = await runCommandScript({ scriptId: 'read_meter', commandType: 'SET_X' });
      expect(result.success).toBe(true);
    });
  });
});
