import crypto from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { shareTicketStore } from '../services/share-ticket-store.js';

describe('shareTicketStore (memory)', () => {
  beforeEach(() => {
    shareTicketStore.clearForTests();
  });

  it('persists and retrieves share entries', async () => {
    const secretHash = crypto.createHash('sha256').update('token', 'utf8').digest();
    await shareTicketStore.set('share-1', {
      ownerSub: 'owner',
      name: 'Pool',
      permissions: 'view',
      secretHash,
      expiresAt: Date.now() + 60_000,
      consumed: false,
    });

    const entry = await shareTicketStore.get('share-1');
    expect(entry?.name).toBe('Pool');
    expect(entry?.secretHash.equals(secretHash)).toBe(true);
  });

  it('deletes share entries', async () => {
    await shareTicketStore.set('share-2', {
      ownerSub: 'o',
      name: 'X',
      permissions: 'admin',
      secretHash: Buffer.alloc(32),
      expiresAt: Date.now() + 60_000,
      consumed: false,
    });
    await shareTicketStore.delete('share-2');
    expect(await shareTicketStore.get('share-2')).toBeNull();
  });
});
