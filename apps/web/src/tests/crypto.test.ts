import { describe, expect, it } from 'vitest';
import { decrypt, decryptWithKey, encrypt, encryptWithKey, generateVaultKey } from '../lib/crypto';

describe('Web Crypto AES-GCM 256-bit', () => {
  const passphrase = 'test-passphrase-2026';

  it('should encrypt and decrypt a string roundtrip', async () => {
    const plaintext = 'sk-abcdef1234567890';
    const encrypted = await encrypt(plaintext, passphrase);
    const decrypted = await decrypt(encrypted, passphrase);
    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertexts for same plaintext (random IV)', async () => {
    const plaintext = 'same-key-value';
    const a = await encrypt(plaintext, passphrase);
    const b = await encrypt(plaintext, passphrase);
    expect(a).not.toBe(b);
  });

  it('should fail to decrypt with wrong passphrase', async () => {
    const encrypted = await encrypt('secret', passphrase);
    await expect(decrypt(encrypted, 'wrong-passphrase')).rejects.toThrow();
  });

  it('should handle empty string', async () => {
    const encrypted = await encrypt('', passphrase);
    const decrypted = await decrypt(encrypted, passphrase);
    expect(decrypted).toBe('');
  });

  it('should handle unicode characters', async () => {
    const plaintext = '🔑 API-Schlüssel für KI-Optimierung';
    const encrypted = await encrypt(plaintext, passphrase);
    const decrypted = await decrypt(encrypted, passphrase);
    expect(decrypted).toBe(plaintext);
  });

  it('should produce base64-encoded output', async () => {
    const encrypted = await encrypt('test', passphrase);
    // base64 chars only
    expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/);
  });
});

describe('Non-extractable CryptoKey vault (ADR-026)', () => {
  it('generates a non-extractable AES-GCM 256-bit key', async () => {
    const key = await generateVaultKey();
    expect(key).toBeInstanceOf(CryptoKey);
    expect(key.extractable).toBe(false);
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    // Its raw bytes can never be exported — the point of the redesign.
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });

  it('encrypts and decrypts a roundtrip with a CryptoKey', async () => {
    const key = await generateVaultKey();
    const plaintext = '🔑 sk-live-abcdef — mTLS PEM bundle';
    const encrypted = await encryptWithKey(plaintext, key);
    expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(await decryptWithKey(encrypted, key)).toBe(plaintext);
  });

  it('produces different ciphertexts for the same plaintext (random IV)', async () => {
    const key = await generateVaultKey();
    const a = await encryptWithKey('same', key);
    const b = await encryptWithKey('same', key);
    expect(a).not.toBe(b);
  });

  it('fails to decrypt with a different key', async () => {
    const k1 = await generateVaultKey();
    const k2 = await generateVaultKey();
    const encrypted = await encryptWithKey('secret', k1);
    await expect(decryptWithKey(encrypted, k2)).rejects.toThrow();
  });
});
