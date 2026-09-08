/**
 * Secure Store — BYOK Vault for per-adapter encrypted credential storage
 *
 * Uses Web Crypto API (AES-GCM 256-bit) to encrypt adapter credentials
 * (mTLS certs, auth tokens, passwords) before storing them in IndexedDB.
 *
 * Architecture (ADR-026):
 *   1. A single non-extractable AES-GCM 256-bit master CryptoKey, persisted as a
 *      key *handle* in IndexedDB — its raw bytes can never be exported.
 *   2. Each adapter config encrypted individually with a unique IV.
 *   3. Credentials NEVER stored in plaintext — only encrypted blobs in Dexie.
 *
 * Supports: mTLS client certs/keys, auth tokens, MQTT passwords,
 *           EEBUS SHIP SKI fingerprints, OCPP security profiles.
 *
 * ADR-026: The vault key is a `generateKey({ extractable: false })` handle stored
 * in the Dexie `settings` table under 'vault-key-v2'. Unlike the previous scheme
 * (a base64 passphrase written plaintext into IndexedDB, recoverable by anything
 * that could read the DB — CWE-312/CWE-522), a non-extractable handle yields no
 * key material to passive exfiltration (extension, disk, profile copy). On-origin
 * XSS can still *use* the handle; that residual is documented in ADR-026.
 */

import type { AdapterConnectionConfig } from '../core/adapters/EnergyAdapter';
import { hasPemMaterial } from '../core/adapters/ocpp-security';
import { decryptWithKey, encryptWithKey, generateVaultKey } from './crypto';
import { nexusDb } from './db';

// ─── Types ───────────────────────────────────────────────────────────

// HIGH-01: InfluxDB is now a supported credential ID (moved from localStorage)
export type AdapterCredentialId =
  | 'victron-mqtt'
  | 'modbus-sunspec'
  | 'knx'
  | 'ocpp-21'
  | 'eebus'
  | 'homeassistant-mqtt'
  | 'influxdb';

export interface AdapterCredentials {
  /** Auth token / password for the connection */
  authToken?: string;
  /** mTLS client certificate (PEM base64) */
  clientCert?: string;
  /** mTLS client key (PEM base64) */
  clientKey?: string;
  /** CA certificate for server verification (PEM base64) */
  caCert?: string;
  /** EEBUS SHIP SKI fingerprint */
  skiFingerprint?: string;
  /** OCPP security profile (0–3) */
  ocppSecurityProfile?: number;
  /** Additional provider-specific fields */
  extra?: Record<string, string>;
}

export interface EncryptedAdapterCredential {
  adapterId: string;
  encryptedPayload: string;
  updatedAt: number;
}

// ─── Persistent Non-Extractable Vault Key (ADR-026) ──────────────────

/**
 * Dexie settings key that stores the vault CryptoKey *handle*. IndexedDB holds
 * the key via structured clone; because the key is non-extractable, reading this
 * record yields an unusable-for-export handle, not raw key bytes.
 */
const VAULT_KEY_KEY = 'vault-key-v2';

/**
 * In-memory cache of the vault key for the current page session.
 * Populated lazily on first call to getVaultKey().
 */
let _cachedVaultKey: CryptoKey | null = null;

/**
 * Returns the non-extractable vault key, loading it from IndexedDB or generating
 * and persisting a fresh one on first use.
 *
 * ADR-026: replaces the former plaintext passphrase. No migration path exists by
 * design (the app has zero existing users); any legacy 'vault-passphrase-v1'
 * record is simply ignored.
 */
export async function getVaultKey(): Promise<CryptoKey> {
  if (_cachedVaultKey) return _cachedVaultKey;

  try {
    const record = await nexusDb.settings.get(VAULT_KEY_KEY);
    if (record?.value instanceof CryptoKey) {
      _cachedVaultKey = record.value;
      return _cachedVaultKey;
    }
  } catch {
    // Dexie unavailable — fall through to generate a new key
  }

  const key = await generateVaultKey();

  try {
    // biome-ignore lint/suspicious/noExplicitAny: StoredSettings is a complex union type; the value is a structured-cloned CryptoKey handle
    await nexusDb.settings.put({ key: VAULT_KEY_KEY, value: key as any });
  } catch (err) {
    console.warn('[SecureStore] Could not persist vault key to IndexedDB:', err);
  }

  _cachedVaultKey = key;
  return key;
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Store encrypted adapter credentials in IndexedDB.
 */
export async function saveAdapterCredentials(
  adapterId: AdapterCredentialId,
  credentials: AdapterCredentials,
): Promise<void> {
  const key = await getVaultKey();
  const payload = JSON.stringify(credentials);
  const encryptedPayload = await encryptWithKey(payload, key);

  await nexusDb.adapterCredentials.put({
    adapterId,
    encryptedPayload,
    updatedAt: Date.now(),
  });
}

/**
 * Retrieve and decrypt adapter credentials from IndexedDB.
 * Returns null if not found or decryption fails (session expired).
 */
export async function getAdapterCredentials(
  adapterId: AdapterCredentialId,
): Promise<AdapterCredentials | null> {
  const record = await nexusDb.adapterCredentials.get(adapterId);
  if (!record) return null;

  try {
    const key = await getVaultKey();
    const decrypted = await decryptWithKey(record.encryptedPayload, key);
    return JSON.parse(decrypted) as AdapterCredentials;
  } catch {
    // Decryption failed — key unavailable/rotated, credentials must be re-entered
    return null;
  }
}

/**
 * Remove adapter credentials from IndexedDB.
 */
export async function removeAdapterCredentials(adapterId: AdapterCredentialId): Promise<void> {
  await nexusDb.adapterCredentials.delete(adapterId);
}

/**
 * EEBUS local certificate PEM vault.
 *
 * PEM material is encrypted with the same AES-GCM 256-bit vault passphrase
 * used for adapter credentials. Only metadata (fingerprint, validUntil, etc.)
 * is stored in the Dexie `eebusLocalCertificates` table; the PEM payload lives
 * in this encrypted settings blob keyed by cert id.
 */

const EEBUS_LOCAL_CERT_PEMS_KEY = 'eebus-local-cert-pems-v1';

export type EEBUSLocalCertPemMap = Record<number, string>;

export async function loadEebusLocalCertPems(): Promise<EEBUSLocalCertPemMap> {
  const record = await nexusDb.settings.get(EEBUS_LOCAL_CERT_PEMS_KEY);
  if (!record?.value || typeof record.value !== 'string') return {};

  try {
    const key = await getVaultKey();
    const decrypted = await decryptWithKey(record.value, key);
    return JSON.parse(decrypted) as EEBUSLocalCertPemMap;
  } catch {
    return {};
  }
}

export async function saveEebusLocalCertPems(pems: EEBUSLocalCertPemMap): Promise<void> {
  const key = await getVaultKey();
  const encrypted = await encryptWithKey(JSON.stringify(pems), key);

  // biome-ignore lint/suspicious/noExplicitAny: StoredSettings is a complex union type
  await nexusDb.settings.put({ key: EEBUS_LOCAL_CERT_PEMS_KEY, value: encrypted as any });
}

/**
 * List all stored adapter credential IDs (without decrypting).
 */
export async function listAdapterCredentials(): Promise<
  Array<{ adapterId: AdapterCredentialId; updatedAt: number }>
> {
  const records = await nexusDb.adapterCredentials.toArray();
  return records.map(({ adapterId, updatedAt }) => ({
    adapterId: adapterId as AdapterCredentialId,
    updatedAt,
  }));
}

/**
 * Check if credentials exist for a given adapter.
 */
export async function hasAdapterCredentials(adapterId: AdapterCredentialId): Promise<boolean> {
  const count = await nexusDb.adapterCredentials.where('adapterId').equals(adapterId).count();
  return count > 0;
}

/**
 * Merge decrypted credentials into an AdapterConnectionConfig.
 * Used by the adapter bridge to inject secrets at connect time.
 */
export async function mergeCredentialsIntoConfig(
  adapterId: AdapterCredentialId,
  config: AdapterConnectionConfig,
): Promise<AdapterConnectionConfig> {
  const creds = await getAdapterCredentials(adapterId);
  if (!creds) return config;

  return {
    ...config,
    ...(creds.authToken != null
      ? { authToken: creds.authToken }
      : config.authToken != null
        ? { authToken: config.authToken }
        : {}),
    ...(creds.clientCert != null
      ? { clientCert: creds.clientCert }
      : config.clientCert != null
        ? { clientCert: config.clientCert }
        : {}),
    ...(creds.clientKey != null
      ? { clientKey: creds.clientKey }
      : config.clientKey != null
        ? { clientKey: config.clientKey }
        : {}),
    ...(creds.caCert != null
      ? { caCert: creds.caCert }
      : config.caCert != null
        ? { caCert: config.caCert }
        : {}),
    tls: !!(hasPemMaterial(creds.clientCert) || hasPemMaterial(config.clientCert) || config.tls),
  };
}

/**
 * Clear all adapter credentials (for full vault reset).
 */
export async function clearVault(): Promise<void> {
  await nexusDb.adapterCredentials.clear();
  _cachedVaultKey = null;
}
