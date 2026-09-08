/**
 * Web Crypto API encryption utilities for BYOK key storage.
 * Uses PBKDF2 key derivation + AES-GCM 256-bit encryption.
 * Keys are NEVER stored in plaintext — only encrypted blobs in Dexie.
 */

const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 600_000;

/**
 * Derives an AES-GCM 256-bit key from a passphrase using PBKDF2.
 */
async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypts plaintext with AES-GCM 256-bit using a passphrase.
 * Returns a base64-encoded string containing salt + IV + ciphertext.
 */
export async function encrypt(plaintext: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(passphrase, salt);

  const encoder = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext),
  );

  // Concatenate salt + iv + ciphertext into a single buffer
  const combined = new Uint8Array(SALT_LENGTH + IV_LENGTH + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, SALT_LENGTH);
  combined.set(new Uint8Array(ciphertext), SALT_LENGTH + IV_LENGTH);

  return btoa(String.fromCharCode(...combined));
}

// ─── Non-extractable CryptoKey vault (ADR-026) ───────────────────────
//
// The passphrase functions above derive a key from a secret string; if that
// secret is persisted (e.g. in IndexedDB) it can be read back, so AES-GCM
// provides only obfuscation at rest. The functions below instead use a
// *non-extractable* CryptoKey: the raw bytes can never be exported — not even
// with full IndexedDB read access — so passive exfiltration (extension, disk,
// profile copy) no longer yields the key. The handle is stored directly in
// IndexedDB via structured clone. On-origin XSS can still *use* the handle;
// that residual is documented in ADR-026.

/** Generate a fresh non-extractable AES-GCM 256-bit vault key. */
export async function generateVaultKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/**
 * Encrypt with a raw AES-GCM CryptoKey (no PBKDF2/salt — the key is already a
 * strong random key). Returns base64(iv + ciphertext).
 */
export async function encryptWithKey(plaintext: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), IV_LENGTH);

  return btoa(String.fromCharCode(...combined));
}

/** Decrypt a base64(iv + ciphertext) blob produced by {@link encryptWithKey}. */
export async function decryptWithKey(encoded: string, key: CryptoKey): Promise<string> {
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

/**
 * Decrypts a base64-encoded AES-GCM 256-bit ciphertext using a passphrase.
 */
export async function decrypt(encoded: string, passphrase: string): Promise<string> {
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));

  const salt = combined.slice(0, SALT_LENGTH);
  const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

  const key = await deriveKey(passphrase, salt);

  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);

  return new TextDecoder().decode(plaintext);
}
