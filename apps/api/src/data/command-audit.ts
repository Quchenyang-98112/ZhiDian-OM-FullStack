/**
 * CommandAuditLog — Persists every hardware command the WebSocket gateway
 * receives, accepted or rejected, for forensics and compliance.
 *
 * Distinct from `audit-log.ts` (which records automated EnergyRouter decisions):
 * this captures *operator/client* commands and their outcome (validation,
 * scope, rate-limit) before they reach the mock data or live adapters.
 *
 * Storage: append-only NDJSON file (`apps/api/data/command-audit.ndjson`).
 * No native binary dependencies — pure Node.js fs module.
 *
 * Retention: file capped at MAX_BYTES (10 MB). When exceeded, the oldest half
 * of lines is discarded on the next write.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { JWTScope } from '../middleware/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const AUDIT_PATH = join(DATA_DIR, 'command-audit.ndjson');
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export type CommandOutcome =
  | 'accepted'
  | 'rejected_validation'
  | 'rejected_dispatch'
  | 'rejected_scope'
  | 'rejected_ratelimit'
  | 'rejected_readonly';

export interface CommandAuditEntry {
  ts: number;
  clientId: string;
  scope: JWTScope;
  commandType: string;
  value: number | string | boolean | null;
  outcome: CommandOutcome;
  reason?: string | undefined;
  /** Effective ADAPTER_MODE at execution time ('mock' | 'live'). */
  mode: string;
}

/**
 * Persist a single command audit entry (append-only NDJSON).
 * Never throws — audit logging must not break the command path.
 */
export function writeCommandAuditEntry(entry: CommandAuditEntry): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const line = `${JSON.stringify(entry)}\n`;
    appendFileSync(AUDIT_PATH, line, 'utf8');
    trimAuditFileIfNeeded();
  } catch (err) {
    console.error('[CommandAudit] Write failed:', err);
  }
}

/** Read the most recent N command audit entries (newest first; default 100). */
export function readRecentCommandAudit(limit = 100): CommandAuditEntry[] {
  if (!existsSync(AUDIT_PATH)) return [];
  try {
    const content = readFileSync(AUDIT_PATH, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    return lines
      .slice(-limit)
      .reverse()
      .map((line) => JSON.parse(line) as CommandAuditEntry);
  } catch {
    return [];
  }
}

/** Trim the audit file when it exceeds MAX_BYTES: keep the newest half. */
function trimAuditFileIfNeeded(): void {
  try {
    const content = readFileSync(AUDIT_PATH, 'utf8');
    const byteLen = Buffer.byteLength(content, 'utf8');
    if (byteLen < MAX_BYTES) return;

    const lines = content.split('\n').filter(Boolean);
    const keep = lines.slice(Math.floor(lines.length / 2));
    writeFileSync(AUDIT_PATH, `${keep.join('\n')}\n`, 'utf8');
  } catch {
    // non-fatal
  }
}
