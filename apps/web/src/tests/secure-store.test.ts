import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { nexusDb } from '../lib/db';
import {
  clearVault,
  getAdapterCredentials,
  getVaultKey,
  hasAdapterCredentials,
  listAdapterCredentials,
  loadEebusLocalCertPems,
  mergeCredentialsIntoConfig,
  removeAdapterCredentials,
  saveAdapterCredentials,
  saveEebusLocalCertPems,
} from '../lib/secure-store';

describe('Secure Store', () => {
  beforeEach(async () => {
    await clearVault();
    await nexusDb.settings.delete('vault-key-v2');
    await nexusDb.settings.delete('vault-passphrase-v1');
    await nexusDb.settings.delete('eebus-local-cert-pems-v1');
  });

  it('uses a non-extractable AES-GCM vault key (ADR-026)', async () => {
    const key = await getVaultKey();
    expect(key).toBeInstanceOf(CryptoKey);
    expect(key.extractable).toBe(false);
    expect(key.algorithm.name).toBe('AES-GCM');
    // A non-extractable key cannot have its raw bytes exported.
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });

  it('should save and retrieve adapter credentials', async () => {
    await saveAdapterCredentials('victron-mqtt', { authToken: 'mqtt-secret' });
    const creds = await getAdapterCredentials('victron-mqtt');
    expect(creds?.authToken).toBe('mqtt-secret');
  });

  it('should return null for missing adapter credentials', async () => {
    expect(await getAdapterCredentials('knx')).toBeNull();
  });

  it('should report credential presence via hasAdapterCredentials', async () => {
    expect(await hasAdapterCredentials('ocpp-21')).toBe(false);
    await saveAdapterCredentials('ocpp-21', { authToken: 'ocpp-key' });
    expect(await hasAdapterCredentials('ocpp-21')).toBe(true);
  });

  it('should list stored credential ids without decrypting payloads', async () => {
    await saveAdapterCredentials('eebus', { skiFingerprint: 'abc123' });
    await saveAdapterCredentials('influxdb', { authToken: 'influx-token' });

    const list = await listAdapterCredentials();
    expect(list).toHaveLength(2);
    expect(list.map((entry) => entry.adapterId).sort()).toEqual(['eebus', 'influxdb']);
    expect(list[0].updatedAt).toBeTypeOf('number');
  });

  it('should remove adapter credentials', async () => {
    await saveAdapterCredentials('modbus-sunspec', { authToken: 'token' });
    await removeAdapterCredentials('modbus-sunspec');
    expect(await getAdapterCredentials('modbus-sunspec')).toBeNull();
  });

  it('should merge decrypted credentials into adapter config', async () => {
    await saveAdapterCredentials('knx', {
      authToken: 'knx-token',
      clientCert: 'CERT',
      clientKey: 'KEY',
    });

    const merged = await mergeCredentialsIntoConfig('knx', {
      name: 'KNX Gateway',
      host: '192.168.1.50',
      port: 3671,
    });

    expect(merged.authToken).toBe('knx-token');
    expect(merged.clientCert).toBe('CERT');
    expect(merged.clientKey).toBe('KEY');
    expect(merged.tls).toBe(true);
    expect(merged.host).toBe('192.168.1.50');
  });

  it('should return original config when no credentials exist', async () => {
    const config = { name: 'Victron', host: '10.0.0.1', port: 8080 };
    const merged = await mergeCredentialsIntoConfig('victron-mqtt', config);
    expect(merged).toEqual(config);
  });

  it('should persist and load encrypted EEBUS local cert PEM map', async () => {
    await saveEebusLocalCertPems({ 1: 'pem-one', 2: 'pem-two' });
    const loaded = await loadEebusLocalCertPems();
    expect(loaded).toEqual({ 1: 'pem-one', 2: 'pem-two' });
  });

  it('should return empty map when EEBUS PEM vault is missing', async () => {
    expect(await loadEebusLocalCertPems()).toEqual({});
  });

  it('should clear all adapter credentials on vault reset', async () => {
    await saveAdapterCredentials('victron-mqtt', { authToken: 'token' });
    await clearVault();
    expect(await hasAdapterCredentials('victron-mqtt')).toBe(false);
    expect(await listAdapterCredentials()).toHaveLength(0);
  });
});
