/**
 * Encrypted AI key storage using Dexie + Web Crypto API.
 * Keys are encrypted with AES-GCM 256-bit before storage.
 *
 * ADR-026: encryption uses the shared non-extractable vault CryptoKey from
 * secure-store (getVaultKey) — a key handle whose raw bytes can never be
 * exported, persisted in IndexedDB. It replaces the former plaintext passphrase.
 */

import { decryptWithKey, encryptWithKey } from './crypto';
import { nexusDb } from './db';
import { getVaultKey } from './secure-store';
import { syncLlmConfigToBackend } from './zhidian-api';

export type AIProvider = 'openai' | 'anthropic' | 'google' | 'xai' | 'groq' | 'ollama' | 'custom';

export interface AIProviderConfig {
  provider: AIProvider;
  label: string;
  baseUrl: string;
  models: string[];
}

export const AI_PROVIDERS: Record<AIProvider, AIProviderConfig> = {
  openai: {
    provider: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'o4-mini'],
  },
  anthropic: {
    provider: 'anthropic',
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250514'],
  },
  google: {
    provider: 'google',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: ['gemini-3.0-flash', 'gemini-3.1-pro'],
  },
  xai: {
    provider: 'xai',
    label: 'xAI (Grok)',
    baseUrl: 'https://api.x.ai/v1',
    models: ['grok-3', 'grok-3-mini'],
  },
  groq: {
    provider: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['llama-3.3-70b-versatile', 'llama-4-scout-17b-16e-instruct'],
  },
  ollama: {
    provider: 'ollama',
    label: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/api',
    models: ['llama4', 'mistral', 'qwen3'],
  },
  custom: {
    provider: 'custom',
    label: 'Custom Endpoint',
    baseUrl: '',
    models: [],
  },
};

/**
 * HIGH-05: Check whether IndexedDB / Dexie is available in this environment.
 * Returns false in Safari private mode, some CI environments, or when storage is blocked.
 */
export async function isKeyStorageAvailable(): Promise<boolean> {
  try {
    await nexusDb.aiKeys.count();
    return true;
  } catch {
    return false;
  }
}

/**
 * Stores an encrypted AI API key in Dexie.
 * HIGH-05: Throws with a clear message if IndexedDB is unavailable.
 * HIGH-09: Uses persistent vault passphrase from getVaultPassphrase().
 */
export async function saveAIKey(
  provider: AIProvider,
  apiKey: string,
  model: string,
  customBaseUrl?: string,
): Promise<void> {
  const available = await isKeyStorageAvailable();
  if (!available) {
    throw new Error(
      'IndexedDB is not available in this environment. ' +
        'AI keys cannot be stored. Please use a non-private browsing context.',
    );
  }
  const key = await getVaultKey();
  const encryptedKey = await encryptWithKey(apiKey, key);

  await nexusDb.aiKeys.put({
    provider,
    encryptedKey,
    model,
    baseUrl: customBaseUrl || AI_PROVIDERS[provider].baseUrl,
    createdAt: Date.now(),
    lastUsed: Date.now(),
  });
}

/**
 * Retrieves and decrypts an AI API key from Dexie.
 */
export async function getAIKey(provider: AIProvider): Promise<{
  apiKey: string;
  model: string;
  baseUrl: string;
} | null> {
  const record = await nexusDb.aiKeys.get(provider);
  if (!record) return null;

  try {
    const key = await getVaultKey();
    const apiKey = await decryptWithKey(record.encryptedKey, key);

    // Update last used timestamp
    await nexusDb.aiKeys.update(provider, { lastUsed: Date.now() });

    return { apiKey, model: record.model, baseUrl: record.baseUrl };
  } catch {
    // Decryption failed (session expired) — key must be re-entered
    return null;
  }
}

/**
 * Removes an AI API key from Dexie.
 */
export async function removeAIKey(provider: AIProvider): Promise<void> {
  await nexusDb.aiKeys.delete(provider);
}

/**
 * Lists all stored AI providers (without decrypting keys).
 */
export async function listAIKeys(): Promise<
  Array<{
    provider: AIProvider;
    model: string;
    baseUrl: string;
    createdAt: number;
    lastUsed: number;
  }>
> {
  const records = await nexusDb.aiKeys.toArray();
  const validProviders = new Set<string>(Object.keys(AI_PROVIDERS));
  return records
    .filter(({ provider }) => validProviders.has(provider))
    .map(({ provider, model, baseUrl, createdAt, lastUsed }) => ({
      provider: provider as AIProvider,
      model,
      baseUrl,
      createdAt,
      lastUsed,
    }));
}

/**
 * Gets the active/default AI provider.
 */
export async function getActiveProvider(): Promise<AIProvider | null> {
  const stored = localStorage.getItem('nexus-hems-ai-provider');
  if (stored && Object.keys(AI_PROVIDERS).includes(stored)) {
    return stored as AIProvider;
  }
  // Fall back to first configured provider
  const keys = await listAIKeys();
  return keys.length > 0 ? keys[0].provider : null;
}

/**
 * Sets the active AI provider.
 */
export function setActiveProvider(provider: AIProvider): void {
  localStorage.setItem('nexus-hems-ai-provider', provider);
}

/**
 * Sends the active provider to the local FastAPI adapter without persisting
 * the secret there. The adapter keeps it in memory for the current run only.
 */
export async function syncActiveAIKeyToBackend(provider?: AIProvider): Promise<boolean> {
  const active = provider ?? (await getActiveProvider());
  if (!active) return false;
  const key = await getAIKey(active);
  if (!key) return false;
  try {
    await syncLlmConfigToBackend({
      provider: active,
      baseUrl: key.baseUrl,
      model: key.model,
      apiKey: key.apiKey,
    });
    return true;
  } catch {
    // The frontend remains usable in local/demo mode when the adapter is offline.
    return false;
  }
}
