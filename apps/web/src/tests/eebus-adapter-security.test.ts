/**
 * EEBUS security — SEC-03 auto-PIN removal and pin_required events.
 */
import { describe, expect, it, vi } from 'vitest';
import { EEBUSAdapter } from '../core/adapters/EEBUSAdapter';

describe('EEBUSAdapter security (Milestone 2.2)', () => {
  it('does not auto-send PIN OK on connectionPinState', () => {
    const adapter = new EEBUSAdapter({
      host: '192.168.1.10',
      port: 4712,
      mock: true,
      skiFingerprint: 'a'.repeat(40),
    });

    const sendSpy = vi.spyOn(WebSocket.prototype, 'send');
    const events: string[] = [];
    adapter.onEvent((e) => {
      if (e.type === 'pin_required') events.push(e.type);
    });

    const raw = JSON.stringify({
      connectionPinState: [{ ski: 'b'.repeat(40), pinState: 'required' }],
    });

    (adapter as unknown as { handleMessage(raw: string): void }).handleMessage(raw);

    expect(events).toContain('pin_required');
    const pinOkSent = sendSpy.mock.calls.some(([payload]) =>
      String(payload).includes('"pinState":"ok"'),
    );
    expect(pinOkSent).toBe(false);
    sendSpy.mockRestore();
  });
});
