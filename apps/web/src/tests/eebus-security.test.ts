import { describe, expect, it } from 'vitest';
import { validateEebusConnectConfig } from '../core/adapters/eebus-security';

describe('validateEebusConnectConfig', () => {
  it('rejects browser connect without skiFingerprint', () => {
    const result = validateEebusConnectConfig(
      { host: '192.168.1.10', tls: true },
      { isBrowser: true },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/skiFingerprint/i);
  });

  it('rejects whitespace-only client certificate when tls is enabled', () => {
    const result = validateEebusConnectConfig({
      host: '192.168.1.10',
      tls: true,
      clientCert: '   ',
      clientKey: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
      skiFingerprint: 'a'.repeat(40),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/certificate/i);
  });

  it('rejects mismatched cert/key pair (cert only)', () => {
    const result = validateEebusConnectConfig({
      host: '192.168.1.10',
      tls: true,
      clientCert: '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----',
      skiFingerprint: 'a'.repeat(40),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/both client certificate and private key/i);
  });

  it('allows mock mode without host or ski', () => {
    const result = validateEebusConnectConfig({ mock: true });
    expect(result.ok).toBe(true);
  });
});
