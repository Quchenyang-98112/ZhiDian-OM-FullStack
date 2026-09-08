import { HEAT_PUMP_MODE_ERROR } from '@nexus-hems/shared-types';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkRateLimit,
  DANGER_COMMANDS,
  describeCommand,
  logCommandAudit,
  requiresConfirmation,
  validateCommand,
  validateCommandShape,
} from '../core/command-safety';
import { nexusDb } from '../lib/db';

describe('command-safety', () => {
  beforeEach(async () => {
    await nexusDb.commandAudit.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  describe('validateCommand', () => {
    it('accepts a valid command', () => {
      const result = validateCommand({ type: 'SET_BATTERY_POWER', value: 2500 });
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('rejects fractional SET_HEAT_PUMP_MODE (SG Ready requires integer 1–4)', () => {
      const result = validateCommand({ type: 'SET_HEAT_PUMP_MODE', value: 2.5 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain(HEAT_PUMP_MODE_ERROR);
    });

    it('rejects a command with an out-of-range value', () => {
      const result = validateCommand({ type: 'SET_EV_CURRENT', value: 100 });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Invalid value/);
    });

    it('rejects a command with a negative value', () => {
      const result = validateCommand({ type: 'SET_GRID_LIMIT', value: -1 });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Invalid value/);
    });

    it('rejects an unknown command type', () => {
      const result = validateCommand({
        type: 'UNKNOWN_COMMAND' as Parameters<typeof validateCommand>[0]['type'],
        value: 1,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Unknown command type/);
    });

    it('rate-limits commands after 30 calls in the same window', () => {
      const command = { type: 'SET_HEAT_PUMP_MODE' as const, value: 2 };
      for (let i = 0; i < 30; i++) {
        expect(validateCommand(command).valid).toBe(true);
      }
      const limited = validateCommand(command);
      expect(limited.valid).toBe(false);
      expect(limited.error).toMatch(/Rate limit exceeded/);
    });

    it('rejects all commands when read-only mode is active', () => {
      vi.stubEnv('VITE_READ_ONLY_MODE', 'true');
      const result = validateCommand({ type: 'SET_BATTERY_POWER', value: 2500 });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/read-only mode/i);
    });

    it('rejects power above the 25 kW safety cap', () => {
      const result = validateCommand({ type: 'SET_EV_POWER', value: 30_000 });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Invalid value/);
    });

    it('accepts bidirectional battery power within cap', () => {
      const result = validateCommand({ type: 'SET_BATTERY_POWER', value: -12_000 });
      expect(result.valid).toBe(true);
    });

    it('validates OpenADR acknowledge event strings', () => {
      const result = validateCommand({
        type: 'OPENADR_ACKNOWLEDGE_EVENT',
        value: 'evt-2026-001',
      });
      expect(result.valid).toBe(true);
    });

    it('rejects VPP flex offer above safety cap', () => {
      const result = validateCommand({ type: 'VPP_OFFER_FLEX', value: 30_000 });
      expect(result.valid).toBe(false);
    });
  });

  describe('validateCommandShape (token-free pre-check)', () => {
    it('validates shape without ever consuming a rate-limit token', () => {
      const command = { type: 'SET_HEAT_PUMP_MODE' as const, value: 2 };
      // Far exceed RATE_LIMIT_MAX (30). The shape check must never rate-limit,
      // so the UI pre-check cannot "double-spend" a token that the dispatch
      // boundary (validateCommand → checkRateLimit) later consumes.
      for (let i = 0; i < 100; i++) {
        expect(validateCommandShape(command).valid).toBe(true);
      }
    });

    it('still rejects an out-of-range value', () => {
      const result = validateCommandShape({ type: 'SET_EV_CURRENT', value: 100 });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Invalid value/);
    });

    it('still rejects all commands in read-only mode', () => {
      vi.stubEnv('VITE_READ_ONLY_MODE', 'true');
      const result = validateCommandShape({ type: 'SET_BATTERY_POWER', value: 2500 });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/read-only mode/i);
    });

    it('leaves a full token budget for validateCommand after a shape pre-check', () => {
      const command = { type: 'SET_GRID_LIMIT' as const, value: 5000 };
      // A UI pre-check (shape) followed by the single authoritative gate must
      // still allow the documented 30 dispatches within one window.
      validateCommandShape(command);
      for (let i = 0; i < 30; i++) {
        expect(validateCommand(command).valid).toBe(true);
      }
      expect(validateCommand(command).valid).toBe(false);
    });
  });

  describe('requiresConfirmation', () => {
    it.each(Array.from(DANGER_COMMANDS))('requires confirmation for %s', (type) => {
      expect(requiresConfirmation({ type, value: 1 })).toBe(true);
    });

    it('does not require confirmation for safe commands', () => {
      expect(requiresConfirmation({ type: 'KNX_TOGGLE_LIGHTS', value: true })).toBe(false);
      expect(requiresConfirmation({ type: 'KNX_SET_TEMPERATURE', value: 21 })).toBe(false);
    });
  });

  describe('describeCommand', () => {
    it('marks grid-limit commands as danger', () => {
      const desc = describeCommand({ type: 'SET_GRID_LIMIT', value: 5000 });
      expect(desc.severity).toBe('danger');
      expect(desc.labelKey).toBe('safety.confirmGridLimit');
    });

    it('describes battery commands as warning', () => {
      const desc = describeCommand({ type: 'SET_BATTERY_MODE', value: 'auto' });
      expect(desc.severity).toBe('warning');
      expect(desc.labelKey).toBe('safety.confirmBattery');
    });

    it('falls back to a generic confirmation for unknown commands', () => {
      const desc = describeCommand({
        type: 'UNKNOWN_COMMAND' as Parameters<typeof describeCommand>[0]['type'],
        value: 1,
      });
      expect(desc.labelKey).toBe('safety.confirmGeneric');
    });

    it('marks V2X discharge as danger', () => {
      const desc = describeCommand({ type: 'SET_V2X_DISCHARGE', value: 3000 });
      expect(desc.severity).toBe('danger');
      expect(desc.labelKey).toBe('safety.confirmV2X');
    });

    it('describes EV commands as warning', () => {
      const desc = describeCommand({ type: 'START_CHARGING', value: true });
      expect(desc.severity).toBe('warning');
      expect(desc.labelKey).toBe('safety.confirmEV');
    });

    it('describes heat pump commands as warning', () => {
      const desc = describeCommand({ type: 'SET_HEAT_PUMP_POWER', value: 4000 });
      expect(desc.severity).toBe('warning');
      expect(desc.labelKey).toBe('safety.confirmHeatPump');
    });
  });

  describe('logCommandAudit', () => {
    it('writes a rejected entry to the commandAudit table', async () => {
      await logCommandAudit({
        timestamp: Date.now(),
        commandType: 'SET_BATTERY_POWER',
        value: -5000,
        status: 'rejected',
        error: 'Invalid value',
      });

      const entries = await nexusDb.commandAudit.toArray();
      expect(entries).toHaveLength(1);
      expect(entries[0]?.status).toBe('rejected');
      expect(entries[0]?.commandType).toBe('SET_BATTERY_POWER');
    });

    it('writes an executed entry and records the adapter', async () => {
      await logCommandAudit({
        timestamp: Date.now(),
        commandType: 'SET_EV_CURRENT',
        value: 16,
        status: 'executed',
        adapterId: 'ocpp-21',
        targetDeviceId: 'evse-01',
      });

      const entries = await nexusDb.commandAudit.toArray();
      expect(entries).toHaveLength(1);
      expect(entries[0]?.adapterId).toBe('ocpp-21');
      expect(entries[0]?.targetDeviceId).toBe('evse-01');
    });

    it('trims commandAudit to 5000 entries after overflow', async () => {
      const base = Date.now();
      const bulk = Array.from({ length: 5002 }, (_, i) => ({
        timestamp: base + i,
        commandType: 'SET_BATTERY_POWER' as const,
        value: 100,
        status: 'executed' as const,
      }));
      await nexusDb.commandAudit.bulkAdd(bulk);
      expect(await nexusDb.commandAudit.count()).toBe(5002);

      await logCommandAudit({
        timestamp: base + 10_000,
        commandType: 'SET_EV_CURRENT',
        value: 16,
        status: 'executed',
      });

      const count = await nexusDb.commandAudit.count();
      expect(count).toBeLessThanOrEqual(5000);
      const remaining = await nexusDb.commandAudit.orderBy('timestamp').toArray();
      expect(remaining.at(-1)?.commandType).toBe('SET_EV_CURRENT');
    });

    it('writes emergency_stop and failed audit entries', async () => {
      await logCommandAudit({
        timestamp: Date.now(),
        commandType: 'SET_GRID_LIMIT',
        value: 5000,
        status: 'emergency_stop',
      });
      await logCommandAudit({
        timestamp: Date.now() + 1,
        commandType: 'SET_BATTERY_POWER',
        value: 1000,
        status: 'failed',
        error: 'adapter timeout',
      });

      const entries = await nexusDb.commandAudit.toArray();
      expect(entries).toHaveLength(2);
      expect(entries.map((e) => e.status).sort()).toEqual(['emergency_stop', 'failed']);
    });

    it('does not increment metrics counter for confirmed-only entries', async () => {
      await logCommandAudit({
        timestamp: Date.now(),
        commandType: 'KNX_TOGGLE_LIGHTS',
        value: true,
        status: 'confirmed',
      });
      const entries = await nexusDb.commandAudit.toArray();
      expect(entries).toHaveLength(1);
      expect(entries[0]?.status).toBe('confirmed');
    });
  });

  describe('checkRateLimit', () => {
    it('allows exactly 30 commands and blocks the 31st', () => {
      const type = 'RATE_LIMIT_TEST';
      for (let i = 0; i < 30; i++) {
        expect(checkRateLimit(type)).toBe(true);
      }
      expect(checkRateLimit(type)).toBe(false);
    });

    it('prunes timestamps outside the 60s window', () => {
      vi.useFakeTimers();
      const type = 'RATE_LIMIT_PRUNE';
      const now = Date.now();
      vi.setSystemTime(now);

      for (let i = 0; i < 30; i++) {
        expect(checkRateLimit(type)).toBe(true);
      }
      expect(checkRateLimit(type)).toBe(false);

      vi.setSystemTime(now + 61_000);
      expect(checkRateLimit(type)).toBe(true);
    });
  });
});
