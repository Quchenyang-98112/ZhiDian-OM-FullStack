import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type CommandAuditEntry,
  readRecentCommandAudit,
  writeCommandAuditEntry,
} from '../data/command-audit.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Mirror the module's resolution: data dir is apps/api/data (../../data from src/data/).
const AUDIT_PATH = join(__dirname, '../../data/command-audit.ndjson');

function makeEntry(overrides: Partial<CommandAuditEntry> = {}): CommandAuditEntry {
  return {
    ts: 1_700_000_000_000,
    clientId: 'client-a',
    scope: 'readwrite',
    commandType: 'SET_BATTERY_POWER',
    value: 2000,
    outcome: 'accepted',
    mode: 'mock',
    ...overrides,
  };
}

describe('command-audit NDJSON store', () => {
  beforeEach(() => {
    if (existsSync(AUDIT_PATH)) rmSync(AUDIT_PATH);
  });

  afterEach(() => {
    if (existsSync(AUDIT_PATH)) rmSync(AUDIT_PATH);
  });

  it('returns an empty array when no audit file exists', () => {
    expect(readRecentCommandAudit()).toEqual([]);
  });

  it('persists and reads back an entry (round-trip)', () => {
    const entry = makeEntry();
    writeCommandAuditEntry(entry);

    const read = readRecentCommandAudit();
    expect(read).toHaveLength(1);
    expect(read[0]).toMatchObject(entry);
  });

  it('returns the most recent entries first and honours the limit', () => {
    for (let i = 0; i < 5; i++) {
      writeCommandAuditEntry(makeEntry({ ts: 1_700_000_000_000 + i, value: i }));
    }

    const recent = readRecentCommandAudit(3);
    expect(recent).toHaveLength(3);
    // Newest first: values 4, 3, 2
    expect(recent.map((e) => e.value)).toEqual([4, 3, 2]);
  });

  it('records every outcome type with its reason', () => {
    writeCommandAuditEntry(
      makeEntry({ outcome: 'rejected_scope', reason: 'insufficient scope', scope: 'read' }),
    );
    writeCommandAuditEntry(
      makeEntry({ outcome: 'rejected_ratelimit', commandType: 'unknown', value: null }),
    );
    writeCommandAuditEntry(
      makeEntry({ outcome: 'rejected_dispatch', reason: 'adapter rejected command' }),
    );

    const recent = readRecentCommandAudit();
    expect(recent.map((e) => e.outcome)).toEqual([
      'rejected_dispatch',
      'rejected_ratelimit',
      'rejected_scope',
    ]);
    expect(recent[2]?.reason).toBe('insufficient scope');
  });

  it('tolerates a corrupt line without throwing', () => {
    mkdirSync(dirname(AUDIT_PATH), { recursive: true });
    writeFileSync(AUDIT_PATH, 'not-json\n', 'utf8');
    // A corrupt file yields [] rather than throwing.
    expect(readRecentCommandAudit()).toEqual([]);
  });
});
