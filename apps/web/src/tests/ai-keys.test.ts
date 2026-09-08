import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';

// Mock crypto module — ADR-026 key-based API. generateVaultKey returns a stand-in
// handle; the encrypt/decrypt mocks ignore it and just tag the payload so the
// roundtrip is observable without real WebCrypto.
vi.mock('../lib/crypto', () => ({
  generateVaultKey: vi.fn(async () => ({ mockVaultKey: true })),
  encryptWithKey: vi.fn(async (text: string, _key: unknown) => `ENC:${text}`),
  decryptWithKey: vi.fn(async (cipher: string, _key: unknown) => cipher.replace('ENC:', '')),
}));

import {
  AI_PROVIDERS,
  getActiveProvider,
  getAIKey,
  isKeyStorageAvailable,
  listAIKeys,
  removeAIKey,
  saveAIKey,
  setActiveProvider,
} from '../lib/ai-keys';
import { decryptWithKey } from '../lib/crypto';
import { nexusDb } from '../lib/db';

const storage = new Map<string, string>();

describe('AI Key Storage', () => {
  beforeEach(async () => {
    storage.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    });
    await nexusDb.aiKeys.clear();
    vi.mocked(decryptWithKey).mockImplementation(async (cipher: string) =>
      cipher.replace('ENC:', ''),
    );
  });

  it('should have all 7 providers defined', () => {
    const providers = Object.keys(AI_PROVIDERS);
    expect(providers).toHaveLength(7);
    expect(providers).toContain('openai');
    expect(providers).toContain('anthropic');
    expect(providers).toContain('google');
    expect(providers).toContain('xai');
    expect(providers).toContain('groq');
    expect(providers).toContain('ollama');
    expect(providers).toContain('custom');
  });

  it('should save and retrieve an encrypted key', async () => {
    await saveAIKey('openai', 'sk-test-key-123', 'gpt-4o');
    const result = await getAIKey('openai');

    expect(result).not.toBeNull();
    expect(result!.apiKey).toBe('sk-test-key-123');
    expect(result!.model).toBe('gpt-4o');
    expect(result!.baseUrl).toBe('https://api.openai.com/v1');
  });

  it('should return null for non-existent provider', async () => {
    const result = await getAIKey('anthropic');
    expect(result).toBeNull();
  });

  it('should remove a key', async () => {
    await saveAIKey('google', 'AIza-key', 'gemini-3.0-flash');
    await removeAIKey('google');
    const result = await getAIKey('google');
    expect(result).toBeNull();
  });

  it('should list all stored keys without decrypting', async () => {
    await saveAIKey('openai', 'sk-key1', 'gpt-4o');
    await saveAIKey('groq', 'gsk-key2', 'llama-3.3-70b-versatile');

    const list = await listAIKeys();
    expect(list).toHaveLength(2);
    const providers = list.map((k) => k.provider).sort();
    expect(providers).toEqual(['groq', 'openai']);
    // No apiKey field in list output
    expect((list[0] as Record<string, unknown>).apiKey).toBeUndefined();
  });

  it('should use custom baseUrl when provided', async () => {
    await saveAIKey('custom', 'my-key', 'my-model', 'https://my-llm.local/v1');
    const result = await getAIKey('custom');
    expect(result!.baseUrl).toBe('https://my-llm.local/v1');
  });

  it('should overwrite existing key for same provider', async () => {
    await saveAIKey('openai', 'old-key', 'gpt-4o');
    await saveAIKey('openai', 'new-key', 'gpt-4o-mini');

    const result = await getAIKey('openai');
    expect(result!.apiKey).toBe('new-key');
    expect(result!.model).toBe('gpt-4o-mini');
  });

  it('reports storage availability', async () => {
    await expect(isKeyStorageAvailable()).resolves.toBe(true);
  });

  it('throws when IndexedDB is unavailable during save', async () => {
    const countSpy = vi.spyOn(nexusDb.aiKeys, 'count').mockRejectedValue(new Error('blocked'));
    try {
      await expect(isKeyStorageAvailable()).resolves.toBe(false);
      await expect(saveAIKey('openai', 'sk-test', 'gpt-4o')).rejects.toThrow(
        /IndexedDB is not available/i,
      );
    } finally {
      countSpy.mockRestore();
    }
  });

  it('returns null when decryption fails', async () => {
    await saveAIKey('anthropic', 'sk-secret', 'claude-sonnet-4-20250514');
    vi.mocked(decryptWithKey).mockRejectedValueOnce(new Error('bad cipher'));
    await expect(getAIKey('anthropic')).resolves.toBeNull();
  });

  it('filters unknown providers from listAIKeys', async () => {
    await nexusDb.aiKeys.put({
      provider: 'legacy-provider' as 'openai',
      encryptedKey: 'ENC:legacy',
      model: 'old',
      baseUrl: 'https://example.com',
      createdAt: Date.now(),
      lastUsed: Date.now(),
    });
    await saveAIKey('openai', 'sk-key', 'gpt-4o');

    const list = await listAIKeys();
    expect(list).toHaveLength(1);
    expect(list[0]?.provider).toBe('openai');
  });

  it('persists and reads the active provider from localStorage', async () => {
    setActiveProvider('groq');
    await expect(getActiveProvider()).resolves.toBe('groq');
  });

  it('falls back to the first stored provider when localStorage is empty', async () => {
    await saveAIKey('google', 'AIza-key', 'gemini-3.0-flash');
    await expect(getActiveProvider()).resolves.toBe('google');
  });
});
