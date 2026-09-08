import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_PROTOCOL_DLQ_LINES,
  resetProtocolDlqLineCountForTests,
  writeToProtocolDLQ,
} from './protocol-dlq.js';

vi.mock('node:fs', () => ({
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

describe('writeToProtocolDLQ', () => {
  afterEach(() => {
    resetProtocolDlqLineCountForTests();
    vi.clearAllMocks();
  });

  it('reserves cap slots synchronously before async write', async () => {
    for (let i = 0; i < MAX_PROTOCOL_DLQ_LINES + 5; i++) {
      writeToProtocolDLQ({
        ts: Date.now(),
        source: `entry-${i}`,
        rawPayload: '{}',
        error: 'test',
        protocol: 'homeassistant-mqtt',
      });
    }

    await new Promise<void>((resolve) => setImmediate(resolve));

    const { appendFileSync } = await import('node:fs');
    expect(appendFileSync).toHaveBeenCalledTimes(MAX_PROTOCOL_DLQ_LINES);
  });
});
