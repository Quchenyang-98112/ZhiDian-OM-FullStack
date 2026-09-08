import { describe, expect, it } from 'vitest';
import {
  eebusConfigSchema,
  knxConfigSchema,
  modbusConfigSchema,
  ocppConfigSchema,
  reconnectConfigSchema,
  validateAdapterCredentials,
  validateMTLSConfig,
  victronConfigSchema,
} from '../core/adapter-config-schemas';

const PEM_CERT = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';
const PEM_KEY = '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----';

describe('adapter config schemas', () => {
  it('validates reconnect config', () => {
    expect(
      reconnectConfigSchema.safeParse({
        enabled: true,
        initialDelayMs: 1000,
        maxDelayMs: 30_000,
        backoffMultiplier: 2,
      }).success,
    ).toBe(true);
  });

  it('validates Victron defaults', () => {
    const result = victronConfigSchema.safeParse({
      name: 'Cerbo',
      host: '192.168.1.1',
      port: 1880,
    });
    expect(result.success).toBe(true);
  });

  it('accepts profile 1 with auth token', () => {
    expect(
      ocppConfigSchema.safeParse({
        name: 'EVSE',
        host: 'csms.example.com',
        port: 9000,
        securityProfile: 1,
        authToken: 'basic-auth',
      }).success,
    ).toBe(true);
  });

  it('accepts profile 3 with mTLS material', () => {
    expect(
      ocppConfigSchema.safeParse({
        name: 'EVSE',
        host: 'csms.example.com',
        port: 9000,
        securityProfile: 3,
        clientCert: PEM_CERT,
        clientKey: PEM_KEY,
      }).success,
    ).toBe(true);
  });

  it('validates reconnect backoff bounds', () => {
    expect(
      reconnectConfigSchema.safeParse({
        enabled: true,
        initialDelayMs: 50,
        maxDelayMs: 30_000,
        backoffMultiplier: 2,
      }).success,
    ).toBe(false);
  });

  it('rejects Victron hostnames with invalid characters', () => {
    expect(
      victronConfigSchema.safeParse({
        name: 'Cerbo',
        host: 'bad host name',
        port: 1880,
      }).success,
    ).toBe(false);
  });

  it('validates Modbus polling lower bound', () => {
    expect(
      modbusConfigSchema.safeParse({
        name: 'Inverter',
        host: '192.168.1.2',
        port: 502,
        pollIntervalMs: 500,
      }).success,
    ).toBe(false);
  });

  it('validates KNX hostnames', () => {
    expect(
      knxConfigSchema.safeParse({
        name: 'KNX',
        host: 'invalid host!',
        port: 3671,
      }).success,
    ).toBe(false);
  });

  it('requires mTLS material for profile 3', () => {
    expect(
      ocppConfigSchema.safeParse({
        name: 'EVSE',
        host: 'csms.example.com',
        port: 9000,
        securityProfile: 3,
      }).success,
    ).toBe(false);
  });

  it('requires auth token for profile 2', () => {
    expect(
      ocppConfigSchema.safeParse({
        name: 'EVSE',
        host: 'csms.example.com',
        port: 9000,
        securityProfile: 2,
        authToken: '',
      }).success,
    ).toBe(false);
  });

  it('accepts profile 2 with auth token', () => {
    expect(
      ocppConfigSchema.safeParse({
        name: 'EVSE',
        host: 'csms.example.com',
        port: 9000,
        securityProfile: 2,
        authToken: 'secret-key',
      }).success,
    ).toBe(true);
  });

  it('validates EEBUS TLS and SKI fingerprint', () => {
    expect(
      eebusConfigSchema.safeParse({
        name: 'Heat pump',
        host: '192.168.1.5',
        port: 4712,
        clientCert: PEM_CERT,
        clientKey: PEM_KEY,
        skiFingerprint: 'a'.repeat(40),
      }).success,
    ).toBe(true);
  });
});

describe('validateAdapterCredentials', () => {
  it('accepts empty credentials', () => {
    expect(validateAdapterCredentials({})).toEqual({ valid: true, data: {} });
  });

  it('rejects invalid SKI fingerprint', () => {
    const result = validateAdapterCredentials({ skiFingerprint: 'short' });
    expect(result.valid).toBe(false);
  });

  it('rejects invalid client certificates in credentials', () => {
    const result = validateAdapterCredentials({ clientCert: 'not-pem' });
    expect(result.valid).toBe(false);
  });

  it('accepts credential extras map', () => {
    const result = validateAdapterCredentials({ extra: { mqttUser: 'mqtt' } });
    expect(result.valid).toBe(true);
  });

  it('accepts OCPP security profile', () => {
    const result = validateAdapterCredentials({ ocppSecurityProfile: 2 });
    expect(result.valid).toBe(true);
  });
});

describe('validateMTLSConfig', () => {
  it('accepts optional CA material in mTLS config', () => {
    const result = validateMTLSConfig({
      clientCert: PEM_CERT,
      clientKey: PEM_KEY,
      caCert: PEM_CERT,
      tls: true,
    });
    expect(result.valid).toBe(true);
  });

  it('requires both cert and key', () => {
    const result = validateMTLSConfig({
      clientCert: PEM_CERT,
      clientKey: PEM_KEY,
      tls: true,
    });
    expect(result.valid).toBe(true);
  });

  it('rejects missing client key', () => {
    const result = validateMTLSConfig({
      clientCert: PEM_CERT,
      tls: true,
    });
    expect(result.valid).toBe(false);
  });
});
