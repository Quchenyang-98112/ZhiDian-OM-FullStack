import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { signToken } from '../jwt-utils.js';
import { authenticateWS } from '../middleware/auth.js';
import type { IWsTicketStore } from '../services/ws-ticket-store.js';

// A ticket store that never resolves a ticket — forces the JWT fallback path so
// we exercise scope extraction in authenticateWS.
const noTicketStore = {
  issue: async () => {},
  consume: async () => null,
  clearForTests: () => {},
} as IWsTicketStore;

function wsReqWithToken(token: string): IncomingMessage {
  return {
    url: `/ws?token=${token}`,
    headers: { host: 'localhost' },
  } as unknown as IncomingMessage;
}

describe('authenticateWS scope defaulting (deny-by-default)', () => {
  it('maps an unknown/invalid scope claim to least privilege (read)', async () => {
    const token = await signToken({ sub: 'client-1', scope: 'superuser' }, '5m');
    const client = await authenticateWS(wsReqWithToken(token), noTicketStore);
    expect(client).not.toBeNull();
    expect(client?.scope).toBe('read');
  });

  it('preserves a valid admin scope', async () => {
    const token = await signToken({ sub: 'client-2', scope: 'admin' }, '5m');
    const client = await authenticateWS(wsReqWithToken(token), noTicketStore);
    expect(client?.scope).toBe('admin');
  });

  it('preserves a valid read scope', async () => {
    const token = await signToken({ sub: 'client-3', scope: 'read' }, '5m');
    const client = await authenticateWS(wsReqWithToken(token), noTicketStore);
    expect(client?.scope).toBe('read');
  });
});
