import { describe, expect, it } from 'vitest';
import {
  hasPemMaterial,
  prepareOcppConnection,
  resolveOcppTls,
  validateOcppRevocationConfig,
} from '../core/adapters/ocpp-security';

const PEM_CERT = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';
const PEM_KEY = '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----';

describe('ocpp-security', () => {
  describe('resolveOcppTls', () => {
    it('forces TLS for profile 2 and 3', () => {
      expect(resolveOcppTls(2, false)).toBe(true);
      expect(resolveOcppTls(3, false)).toBe(true);
    });

    it('respects tls flag for profile 0 and 1', () => {
      expect(resolveOcppTls(0, false)).toBe(false);
      expect(resolveOcppTls(0, true)).toBe(true);
      expect(resolveOcppTls(1, true)).toBe(true);
    });
  });

  describe('validateOcppRevocationConfig', () => {
    it('allows off without caCert', () => {
      expect(validateOcppRevocationConfig({ revocationCheck: 'off' })).toBeNull();
    });

    it('requires caCert for CRL mode', () => {
      expect(validateOcppRevocationConfig({ revocationCheck: 'crl' })).toMatch(/caCert/i);
      expect(validateOcppRevocationConfig({ revocationCheck: 'crl', caCert: PEM_CERT })).toBeNull();
    });
  });

  describe('hasPemMaterial', () => {
    it('detects PEM markers and base64 blobs', () => {
      expect(hasPemMaterial(PEM_CERT)).toBe(true);
      expect(hasPemMaterial('QUJDREVGRw==')).toBe(true);
      expect(hasPemMaterial('')).toBe(false);
    });
  });

  describe('prepareOcppConnection', () => {
    const base = {
      host: 'evse.local',
      port: 9000,
      stationId: 'CP001',
    };

    it('builds unsecured ws URL for profile 0', () => {
      const prep = prepareOcppConnection({ ...base, securityProfile: 0, tls: false });
      expect(prep).toEqual({
        ok: true,
        url: 'ws://evse.local:9000/ocpp/CP001',
        protocols: ['ocpp2.1'],
        securityProfile: 0,
      });
    });

    it('embeds Basic Auth for profile 2 over wss', () => {
      const prep = prepareOcppConnection({
        ...base,
        securityProfile: 2,
        authToken: 'secret-key',
      });
      expect(prep.ok).toBe(true);
      if (prep.ok) {
        expect(prep.url).toBe('wss://CP001:secret-key@evse.local:9000/ocpp/CP001');
      }
    });

    it('rejects profile 2 without authToken', () => {
      const prep = prepareOcppConnection({ ...base, securityProfile: 2 });
      expect(prep).toEqual({
        ok: false,
        error: 'OCPP security profile requires authorization key (authToken)',
      });
    });

    it('requires client cert/key for profile 3', () => {
      const prep = prepareOcppConnection({ ...base, securityProfile: 3 });
      expect(prep.ok).toBe(false);
    });

    it('accepts profile 3 with PEM material and warns about browser mTLS', () => {
      const prep = prepareOcppConnection({
        ...base,
        securityProfile: 3,
        clientCert: PEM_CERT,
        clientKey: PEM_KEY,
      });
      expect(prep.ok).toBe(true);
      if (prep.ok) {
        expect(prep.url).toBe('wss://evse.local:9000/ocpp/CP001');
        expect(prep.warnings?.[0]).toMatch(/API proxy/i);
      }
    });
  });
});
