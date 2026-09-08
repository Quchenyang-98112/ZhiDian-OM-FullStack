/**
 * Dexie-backed VaultKeyStore implementation for @nexus-hems/ai-core.
 *
 * Reuses the encrypted aiKeys table from ai-keys.ts so existing user data is
 * preserved. The orchestrator sees only decrypted key material; encryption is
 * handled transparently here.
 */

import type { AIProvider, AIProviderKey, VaultKeyStore } from '@nexus-hems/ai-core';
import { decryptWithKey, encryptWithKey } from './crypto';
import { nexusDb } from './db';
import { getVaultKey } from './secure-store';

const AI_PROVIDER_ORDER: AIProvider[] = [
  'openai',
  'anthropic',
  'google',
  'xai',
  'groq',
  'ollama',
  'custom',
];

export class DexieVaultKeyStore implements VaultKeyStore {
  async set(provider: AIProvider, key: AIProviderKey): Promise<void> {
    const vaultKey = await getVaultKey();
    const encryptedKey = await encryptWithKey(key.apiKey, vaultKey);
    await nexusDb.aiKeys.put({
      provider,
      encryptedKey,
      model: key.model,
      baseUrl: key.baseUrl,
      createdAt: Date.now(),
      lastUsed: Date.now(),
    });
  }

  async get(provider: AIProvider): Promise<AIProviderKey | undefined> {
    const record = await nexusDb.aiKeys.get(provider);
    if (!record) return undefined;

    try {
      const vaultKey = await getVaultKey();
      const apiKey = await decryptWithKey(record.encryptedKey, vaultKey);
      await nexusDb.aiKeys.update(provider, { lastUsed: Date.now() });
      return { apiKey, model: record.model, baseUrl: record.baseUrl };
    } catch (error) {
      console.warn(`[AI] Failed to decrypt key for provider ${provider}:`, error);
      return undefined;
    }
  }

  async remove(provider: AIProvider): Promise<void> {
    await nexusDb.aiKeys.delete(provider);
  }

  async list(): Promise<AIProvider[]> {
    const records = await nexusDb.aiKeys.toArray();
    const providers = records.map((r) => r.provider as AIProvider);
    return AI_PROVIDER_ORDER.filter((p) => providers.includes(p));
  }
}
