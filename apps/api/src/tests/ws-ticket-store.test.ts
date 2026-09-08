import { beforeEach, describe, expect, it } from 'vitest';
import { wsTicketStore } from '../services/ws-ticket-store.js';

describe('wsTicketStore (memory)', () => {
  beforeEach(() => {
    wsTicketStore.clearForTests();
  });

  it('issues and consumes a ticket exactly once', async () => {
    const data = {
      clientId: 'client-a',
      scope: 'readwrite' as const,
      expiresAt: Date.now() + 60_000,
    };
    await wsTicketStore.issue('ticket-1', data);

    const first = await wsTicketStore.consume('ticket-1');
    expect(first).toEqual(data);

    const second = await wsTicketStore.consume('ticket-1');
    expect(second).toBeNull();
  });

  it('returns null for unknown tickets', async () => {
    expect(await wsTicketStore.consume('missing')).toBeNull();
  });

  it('returns null for expired tickets', async () => {
    await wsTicketStore.issue('expired', {
      clientId: 'x',
      scope: 'read',
      expiresAt: Date.now() - 1,
    });
    expect(await wsTicketStore.consume('expired')).toBeNull();
  });
});
