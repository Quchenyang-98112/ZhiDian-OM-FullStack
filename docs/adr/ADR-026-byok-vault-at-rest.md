# ADR-026: BYOK Vault At-Rest — Non-Extractable CryptoKey

- **Status:** Accepted
- **Date:** 2026-07-03
- **Related:** SEC-12 (Technical Debt Registry), `apps/web/src/lib/crypto.ts`, `apps/web/src/lib/secure-store.ts`, `apps/web/src/lib/ai-keys.ts`, HIGH-09 (superseded)

---

## Context

The browser-side "bring your own key" (BYOK) vault encrypts all AI provider API keys (`ai-keys.ts`) and adapter credentials — mTLS client certs/keys, auth tokens, MQTT passwords, EEBUS SHIP SKIs, OCPP security profiles (`secure-store.ts`) — with AES-GCM 256 before storing them in IndexedDB (Dexie).

The AEAD primitives are sound (`crypto.ts`: unique 12-byte IV per message, PBKDF2 600k). The weakness was **key custody**. Under the previous scheme (HIGH-09) the "vault passphrase" was 32 random bytes written **base64 plaintext** into IndexedDB under `vault-passphrase-v1`, then PBKDF2-stretched into the AES key. Anything that could read IndexedDB — on-origin XSS, a malicious browser extension, disk/profile access, a forensic copy — could read the passphrase back and decrypt **everything**. AES-GCM therefore provided *obfuscation*, not real at-rest confidentiality (CWE-312 *Cleartext Storage*, CWE-522 *Insufficiently Protected Credentials*).

## Decision

Replace the stored passphrase with a **non-extractable AES-GCM 256-bit `CryptoKey`**, persisted as a **key handle** in IndexedDB.

- `generateVaultKey()` (`crypto.ts`) creates the key with `crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, /* extractable */ false, ['encrypt', 'decrypt'])`.
- The handle is stored directly in the Dexie `settings` table under `vault-key-v2` (IndexedDB persists `CryptoKey` via structured clone).
- `getVaultKey()` (`secure-store.ts`) loads it, or generates + persists a fresh one on first use, with an in-memory cache for the page session.
- Encryption moves from passphrase-based `encrypt/decrypt` to key-based `encryptWithKey/decryptWithKey` (IV + ciphertext; no PBKDF2/salt needed since the key is already a strong random key).

Because the key is **non-extractable**, its raw bytes can never be exported — `crypto.subtle.exportKey('raw', key)` rejects — even for code holding the handle. Reading the IndexedDB record yields an opaque, export-proof handle rather than key material, so **passive exfiltration (extension, disk, profile copy) no longer recovers the key**.

### No migration

The application has **zero existing users** (maintainer-confirmed), so there is no legacy `vault-passphrase-v1` data to re-encrypt. The passphrase scheme is replaced outright; any legacy record is ignored. A re-encryption migration path is deliberately **not** built.

### Threat model & residual risk

| Threat | Before (plaintext passphrase) | After (non-extractable key) |
|---|---|---|
| Extension / disk / profile read of IndexedDB | 🔴 Full key recovery → decrypt all | 🟢 Handle only; no key material |
| Forensic copy of the origin's storage | 🔴 Recoverable | 🟢 Not exportable |
| **On-origin XSS** (script running on our origin) | 🔴 Recoverable | 🟠 Cannot export the key, but **can still call `decryptWithKey` with the handle** while the page is open |

On-origin XSS remains able to *use* the handle to decrypt (it runs with the origin's privileges). This ADR does not claim to solve that; it is bounded by the app's existing XSS defenses (strict CSP with nonces — AUD-02, no `dangerouslySetInnerHTML`, Trusted-Types-friendly rendering).

### Optional hardened tier (future, opt-in)

The passphrase-based `encrypt/decrypt` functions are **retained** in `crypto.ts` for a future opt-in tier: a **user-supplied vault passphrase** (prompt-to-unlock, key derived per session, never persisted) and/or **WebAuthn PRF** wrapping for hardware-bound keys. These would raise the bar against on-origin XSS (the key is not resident without an unlock) at the cost of UX friction, and are gated behind a settings toggle so the default experience is unchanged. Not implemented here.

## Consequences

- **Positive:** Passive at-rest exfiltration no longer yields decryptable credentials. No plaintext secret in IndexedDB. AEAD behaviour and the public save/get APIs are unchanged for callers.
- **Negative:** The AES key lives only in the browser's key store; clearing site data or a corrupted key handle makes existing ciphertext unrecoverable (credentials must be re-entered) — acceptable for BYOK. On-origin XSS residual remains (documented above).
- **Testing:** `crypto.test.ts` and `secure-store.test.ts` assert the key is non-extractable (`exportKey('raw')` rejects) and that encrypt/decrypt roundtrips; `ai-keys.test.ts` covers the key-based save/get path.
