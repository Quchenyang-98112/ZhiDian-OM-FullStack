import { beforeEach, describe, expect, it } from 'vitest';
import { ocppSessionStore } from '../services/ocpp-session-store.js';

const PEM_CERT = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';
const PEM_KEY = '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----';

describe('ocppSessionStore (memory)', () => {
  beforeEach(() => {
    ocppSessionStore.clearForTests();
  });

  it('issues and consumes a session once', async () => {
    const data = {
      host: '192.168.1.1',
      port: 9000,
      stationId: 'CP1',
      clientCert: PEM_CERT,
      clientKey: PEM_KEY,
      clientId: 'client-a',
      expiresAt: Date.now() + 60_000,
    };
    await ocppSessionStore.issue('session-1', data);

    const first = await ocppSessionStore.consume('session-1');
    expect(first?.stationId).toBe('CP1');

    const second = await ocppSessionStore.consume('session-1');
    expect(second).toBeNull();
  });

  it('returns null for missing session', async () => {
    expect(await ocppSessionStore.consume('missing')).toBeNull();
  });

  it('returns null for expired session', async () => {
    await ocppSessionStore.issue('expired', {
      host: '192.168.1.1',
      port: 9000,
      stationId: 'CP1',
      clientCert: PEM_CERT,
      clientKey: PEM_KEY,
      clientId: 'client-a',
      expiresAt: Date.now() - 1,
    });
    expect(await ocppSessionStore.consume('expired')).toBeNull();
  });
});
