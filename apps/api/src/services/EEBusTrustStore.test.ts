/**
 * EEBusTrustStore — file-backend persistence and merge semantics.
 */

import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SKI_A = 'a'.repeat(40);
const SKI_B = 'b'.repeat(40);

describe('EEBusTrustStore (file backend)', () => {
  const prevEnv = { ...process.env };
  let tmpDir: string;
  let trustFile: string;

  async function loadStore() {
    vi.resetModules();
    process.env.EEBUS_TRUST_BACKEND = 'file';
    process.env.EEBUS_TRUST_FILE = trustFile;
    return import('./EEBusTrustStore.js');
  }

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'eebus-trust-'));
    trustFile = join(tmpDir, 'trust.json');
  });

  afterEach(async () => {
    process.env = { ...prevEnv };
    vi.resetModules();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty list when trust file is missing', async () => {
    const { listDevices } = await loadStore();
    expect(await listDevices()).toEqual([]);
  });

  it('upserts, merges partial updates, and persists atomically', async () => {
    const { upsertDevice, getDevice, listDevices, invalidateCache } = await loadStore();

    await upsertDevice({
      ski: SKI_A,
      hostname: '192.168.1.10',
      port: 4712,
      status: 'pending',
      trustedAt: 100,
    });

    await upsertDevice({
      ski: SKI_A,
      hostname: '192.168.1.10',
      port: 4712,
      brand: 'Viessmann',
      status: 'trusted',
      trustedAt: 200,
      lastConnectedAt: 300,
    });

    const device = await getDevice(SKI_A);
    expect(device?.brand).toBe('Viessmann');
    expect(device?.status).toBe('trusted');
    expect(device?.lastConnectedAt).toBe(300);

    invalidateCache();
    const reloaded = await listDevices();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0]?.ski).toBe(SKI_A);

    const raw = await readFile(trustFile, 'utf-8');
    expect(raw).toContain(SKI_A);
    expect(raw).not.toContain('.tmp');
  });

  it('removes device by SKI', async () => {
    const { upsertDevice, removeDevice, getDevice } = await loadStore();

    await upsertDevice({
      ski: SKI_A,
      hostname: '192.168.1.11',
      port: 4712,
      status: 'trusted',
      trustedAt: 1,
    });

    expect(await removeDevice(SKI_A)).toBe(true);
    expect(await getDevice(SKI_A)).toBeNull();
    expect(await removeDevice(SKI_A)).toBe(false);
  });

  it('updateDeviceStatus merges status and lastConnectedAt', async () => {
    const { upsertDevice, updateDeviceStatus, getDevice } = await loadStore();

    await upsertDevice({
      ski: SKI_B,
      hostname: '192.168.1.20',
      port: 4712,
      status: 'pending',
      trustedAt: 50,
      lastConnectedAt: 100,
    });

    await updateDeviceStatus(SKI_B, 'failed', 500);
    const updated = await getDevice(SKI_B);
    expect(updated?.status).toBe('failed');
    expect(updated?.lastConnectedAt).toBe(500);

    await updateDeviceStatus('unknown-ski', 'trusted');
    expect(await getDevice('unknown-ski')).toBeNull();
  });

  it('isTrusted reflects trusted status only', async () => {
    const { upsertDevice, isTrusted } = await loadStore();

    await upsertDevice({
      ski: SKI_A,
      hostname: '192.168.1.30',
      port: 4712,
      status: 'pending',
      trustedAt: 1,
    });
    expect(await isTrusted(SKI_A)).toBe(false);

    await upsertDevice({
      ski: SKI_A,
      hostname: '192.168.1.30',
      port: 4712,
      status: 'trusted',
      trustedAt: 2,
    });
    expect(await isTrusted(SKI_A)).toBe(true);
  });

  it('treats corrupt trust file as empty store', async () => {
    await writeFile(trustFile, '{not-json', 'utf-8');
    const { listDevices } = await loadStore();
    expect(await listDevices()).toEqual([]);
  });

  it('treats malformed trust document as empty store', async () => {
    await writeFile(trustFile, JSON.stringify({ version: 1, devices: 'nope' }), 'utf-8');
    const { listDevices, upsertDevice } = await loadStore();
    expect(await listDevices()).toEqual([]);
    await upsertDevice({
      ski: SKI_A,
      hostname: '192.168.1.40',
      port: 4712,
      status: 'trusted',
      trustedAt: 1,
    });
    expect(await listDevices()).toHaveLength(1);
  });

  it('lists multiple devices after separate upserts', async () => {
    const { upsertDevice, listDevices } = await loadStore();
    await upsertDevice({
      ski: SKI_A,
      hostname: '192.168.1.41',
      port: 4712,
      status: 'trusted',
      trustedAt: 1,
    });
    await upsertDevice({
      ski: SKI_B,
      hostname: '192.168.1.42',
      port: 4712,
      status: 'pending',
      trustedAt: 2,
    });
    const devices = await listDevices();
    expect(devices).toHaveLength(2);
    expect(devices.map((d) => d.ski).sort()).toEqual([SKI_A, SKI_B].sort());
  });
});
