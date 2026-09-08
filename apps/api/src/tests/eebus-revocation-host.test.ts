import { afterEach, describe, expect, it } from 'vitest';
import { getEebusRevocationConfig, setEebusRevocationConfig } from '../config/eebus-revocation.js';
import { isPrivateHost } from '../config/private-host.js';

describe('isPrivateHost (SSRF guard)', () => {
  it('accepts loopback and localhost', () => {
    expect(isPrivateHost('localhost')).toBe(true);
    expect(isPrivateHost('127.0.0.1')).toBe(true);
    expect(isPrivateHost('::1')).toBe(true);
  });

  it('accepts RFC1918 private ranges', () => {
    expect(isPrivateHost('10.0.0.5')).toBe(true);
    expect(isPrivateHost('172.16.4.2')).toBe(true);
    expect(isPrivateHost('172.31.255.254')).toBe(true);
    expect(isPrivateHost('192.168.1.10')).toBe(true);
  });

  it('accepts IPv6 link-local and mDNS .local hosts', () => {
    expect(isPrivateHost('fe80::1')).toBe(true);
    expect(isPrivateHost('cerbo.local')).toBe(true);
  });

  it('rejects IPv4 link-local incl. the cloud metadata endpoint (SSRF)', () => {
    // 169.254.0.0/16 is no longer treated as private — it covers 169.254.169.254.
    expect(isPrivateHost('169.254.169.254')).toBe(false);
    expect(isPrivateHost('169.254.1.1')).toBe(false);
  });

  it('normalizes a :port suffix and bracketed IPv6 literals', () => {
    expect(isPrivateHost('192.168.0.5:502')).toBe(true);
    expect(isPrivateHost('[::1]:8443')).toBe(true);
    expect(isPrivateHost('[fe80::1]')).toBe(true);
    expect(isPrivateHost('8.8.8.8:443')).toBe(false);
  });

  it('rejects public and out-of-range addresses', () => {
    expect(isPrivateHost('8.8.8.8')).toBe(false);
    expect(isPrivateHost('172.32.0.1')).toBe(false);
    expect(isPrivateHost('172.15.0.1')).toBe(false);
    expect(isPrivateHost('example.com')).toBe(false);
    expect(isPrivateHost('')).toBe(false);
  });
});

describe('EEBUS revocation config', () => {
  afterEach(() => {
    setEebusRevocationConfig({ mode: 'off' });
  });

  it('defaults to off', () => {
    expect(getEebusRevocationConfig()).toEqual({ mode: 'off' });
  });

  it('round-trips an updated CRL policy', () => {
    setEebusRevocationConfig({ mode: 'crl', crlUrl: 'https://example.test/crl.pem' });
    expect(getEebusRevocationConfig()).toEqual({
      mode: 'crl',
      crlUrl: 'https://example.test/crl.pem',
    });
  });

  it('round-trips an OCSP policy', () => {
    setEebusRevocationConfig({ mode: 'ocsp', ocspUrl: 'https://example.test/ocsp' });
    expect(getEebusRevocationConfig().mode).toBe('ocsp');
  });
});
