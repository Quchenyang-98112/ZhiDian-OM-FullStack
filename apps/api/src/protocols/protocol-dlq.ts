/**
 * Shared dead-letter queue writer for backend protocol adapters.
 * All adapters append to DEAD_LETTER_QUEUE_PATH — enforce one global line cap.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import type { ProtocolType } from '@nexus-hems/shared-types';
import { API_RUNTIME_DIR, DEAD_LETTER_QUEUE_PATH } from '../runtime-paths.js';

export const MAX_PROTOCOL_DLQ_LINES = 10_000;

let protocolDlqLineCount = 0;

export interface ProtocolDlqEntry {
  ts: number;
  source: string;
  rawPayload: string;
  error: string;
  protocol: ProtocolType;
}

export function writeToProtocolDLQ(entry: ProtocolDlqEntry): void {
  if (protocolDlqLineCount >= MAX_PROTOCOL_DLQ_LINES) return;
  protocolDlqLineCount++;
  setImmediate(() => {
    try {
      mkdirSync(API_RUNTIME_DIR, { recursive: true });
      appendFileSync(DEAD_LETTER_QUEUE_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
    } catch {
      /* best-effort */
    }
  });
}

/** Test-only reset — not for production use. */
export function resetProtocolDlqLineCountForTests(): void {
  protocolDlqLineCount = 0;
}
