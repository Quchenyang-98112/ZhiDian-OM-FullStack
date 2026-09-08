/**
 * Abstract key store interface for provider API keys.
 *
 * Phase 1 defines a uniform async interface. Concrete implementations
 * (AES-GCM IndexedDB in the web app, secure enclave in Tauri, etc.) are
 * injected by consumers.
 */

import type { AIProvider, AIProviderKey } from '../types.ts';

export interface VaultKeyStore {
  /** Persist key material for a provider. */
  set(provider: AIProvider, key: AIProviderKey): Promise<void>;

  /** Retrieve key material, or undefined if not stored. */
  get(provider: AIProvider): Promise<AIProviderKey | undefined>;

  /** Remove key material for a provider. */
  remove(provider: AIProvider): Promise<void>;

  /** List providers with stored keys. */
  list(): Promise<AIProvider[]>;
}

/**
 * In-memory key store for unit tests and sandboxed environments.
 */
export class MemoryVaultKeyStore implements VaultKeyStore {
  private readonly keys = new Map<AIProvider, AIProviderKey>();

  async set(provider: AIProvider, key: AIProviderKey): Promise<void> {
    this.keys.set(provider, key);
  }

  async get(provider: AIProvider): Promise<AIProviderKey | undefined> {
    return this.keys.get(provider);
  }

  async remove(provider: AIProvider): Promise<void> {
    this.keys.delete(provider);
  }

  async list(): Promise<AIProvider[]> {
    return Array.from(this.keys.keys());
  }
}
