/**
 * AuditLog — Persists automated energy router decisions.
 *
 * Storage: append-only NDJSON file (`apps/api/data/audit.ndjson`).
 * No native binary dependencies — pure Node.js fs module.
 *
 * Retention: file capped at MAX_BYTES (10 MB). When exceeded,
 * the oldest half of lines is discarded on the next write.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const AUDIT_PATH = join(DATA_DIR, 'audit.ndjson');
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export interface AuditEntry {
  ts: number;
  action: string;
  reason: string;
  priceEurKwh: number;
  socPercent: number;
  pvPowerW: number;
  inverterLimitW: number;
}

/** Persist a single audit entry (append-only NDJSON). */
export function writeAuditEntry(entry: AuditEntry): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const line = `${JSON.stringify(entry)}\n`;
    appendFileSync(AUDIT_PATH, line, 'utf8');
    trimAuditFileIfNeeded();
  } catch (err) {
    console.error('[AuditLog] Write failed:', err);
  }
}

/** Read the most recent N audit entries (default: 100). */
export function readRecentAuditEntries(limit = 100): AuditEntry[] {
  if (!existsSync(AUDIT_PATH)) return [];
  try {
    const content = readFileSync(AUDIT_PATH, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    return lines
      .slice(-limit)
      .reverse()
      .map((line) => JSON.parse(line) as AuditEntry);
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

/** No-op: kept for API compatibility with shutdown handlers. */
export function closeAuditDb(): void {
  // NDJSON requires no explicit close
}
