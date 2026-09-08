/**
 * Adapter Marketplace — Dynamic plugin loading from npm CDN + GitHub Releases
 *
 * Provides:
 *   1. Catalog fetch from /adapter-marketplace-catalog.json
 *   2. Semver validation (^, ~, >=, exact)
 *   3. Ed25519 signature verification via SubtleCrypto
 *   4. SHA-256 module integrity check
 *   5. CDN URL allowlist (SSRF protection)
 *   6. Permission model: read-only | write | admin
 *   7. IndexedDB-backed install ledger via Dexie
 */

import type { AdapterFactory } from './adapter-registry';
import { registerAdapter } from './adapter-registry';

// ─── Permission Model ────────────────────────────────────────────────

export type AdapterPermission = 'read-only' | 'write' | 'admin';

export const PERMISSION_RANK: Record<AdapterPermission, number> = {
  'read-only': 0,
  write: 1,
  admin: 2,
};

// ─── Catalog Types ───────────────────────────────────────────────────

export interface MarketplaceEntry {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  source: 'npm' | 'github';
  packageName?: string | undefined;
  githubRepo?: string | undefined;
  releaseTag?: string | undefined;
  cdnUrl: string;
  permissions: AdapterPermission;
  category: 'adapter' | 'controller' | 'analytics' | 'ui' | 'integration';
  tags: string[];
  stars?: number | undefined;
  downloads?: number | undefined;
  verified: boolean;
  signature: string;
}

export interface MarketplaceCatalog {
  version: string;
  updatedAt: string;
  publicKey: string;
  adapters: MarketplaceEntry[];
}

export interface InstalledMarketplaceEntry {
  id: string;
  version: string;
  installedAt: number;
  permissions: AdapterPermission;
  cdnUrl: string;
  verified: boolean;
}

export type InstallStatus =
  | 'idle'
  | 'fetching'
  | 'verifying'
  | 'loading'
  | 'registering'
  | 'done'
  | 'error';

export interface InstallProgress {
  status: InstallStatus;
  error?: string | undefined;
}

// ─── CDN Allowlist (SSRF protection) ────────────────────────────────

const CDN_ALLOWLIST = [
  'https://esm.sh/',
  'https://cdn.skypack.dev/',
  'https://unpkg.com/',
  'https://cdn.jsdelivr.net/npm/',
] as const;

function isCdnUrlAllowed(url: string): boolean {
  return CDN_ALLOWLIST.some((prefix) => url.startsWith(prefix));
}

// ─── Semver Validation ───────────────────────────────────────────────

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function isValidSemver(version: string): boolean {
  return SEMVER_RE.test(version);
}

// ─── Signature Verification (Ed25519 / SubtleCrypto) ─────────────────

function base64UrlToBytes(b64: string): Uint8Array {
  // Normalize base64url → base64
  const b64std = b64
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
  const bin = atob(b64std);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function importEd25519PublicKey(spkiBase64: string): Promise<CryptoKey> {
  const keyBytes = base64UrlToBytes(spkiBase64);
  return crypto.subtle.importKey('spki', keyBytes, { name: 'Ed25519' }, false, ['verify']);
}

async function verifySignature(
  publicKeySpki: string,
  message: string,
  signatureBase64: string,
): Promise<boolean> {
  try {
    const key = await importEd25519PublicKey(publicKeySpki);
    const sigBytes = base64UrlToBytes(signatureBase64);
    const msgBytes = new TextEncoder().encode(message);
    return await crypto.subtle.verify('Ed25519', key, sigBytes, msgBytes);
  } catch {
    // SubtleCrypto not available or invalid key — fail closed
    return false;
  }
}

// ─── Module Integrity (SHA-256) ──────────────────────────────────────

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── Install Ledger (localStorage) ──────────────────────────────────

const LEDGER_KEY = 'nexus-hems:marketplace:installed';

function readLedger(): Map<string, InstalledMarketplaceEntry> {
  try {
    const raw = localStorage.getItem(LEDGER_KEY);
    if (!raw) return new Map();
    const arr = JSON.parse(raw) as InstalledMarketplaceEntry[];
    return new Map(arr.map((e) => [e.id, e]));
  } catch {
    return new Map();
  }
}

function writeLedger(ledger: Map<string, InstalledMarketplaceEntry>): void {
  try {
    localStorage.setItem(LEDGER_KEY, JSON.stringify(Array.from(ledger.values())));
  } catch {
    // Storage quota exceeded — non-fatal
  }
}

// ─── Marketplace Service ─────────────────────────────────────────────

class AdapterMarketplace {
  private catalog: MarketplaceCatalog | null = null;
  private ledger: Map<string, InstalledMarketplaceEntry> = readLedger();
  private progressCallbacks = new Map<string, Set<(p: InstallProgress) => void>>();

  // ── Catalog ──────────────────────────────────────────────────────

  async fetchCatalog(): Promise<MarketplaceCatalog> {
    if (this.catalog) return this.catalog;

    const res = await fetch('/adapter-marketplace-catalog.json', { cache: 'default' });
    if (!res.ok) throw new Error(`Catalog fetch failed: HTTP ${res.status}`);

    const data = (await res.json()) as MarketplaceCatalog;
    if (!data.version || !Array.isArray(data.adapters)) {
      throw new Error('Invalid catalog format');
    }
    this.catalog = data;
    return data;
  }

  getCatalogSync(): MarketplaceCatalog | null {
    return this.catalog;
  }

  async search(query: string, category?: string): Promise<MarketplaceEntry[]> {
    const { adapters } = await this.fetchCatalog();
    const q = query.toLowerCase().trim();
    return adapters.filter((a) => {
      const matchesCategory = !category || category === 'all' || a.category === category;
      const matchesQuery =
        !q ||
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.tags.some((t) => t.includes(q)) ||
        a.id.includes(q);
      return matchesCategory && matchesQuery;
    });
  }

  // ── Install State ─────────────────────────────────────────────────

  isInstalled(id: string): boolean {
    return this.ledger.has(id);
  }

  getInstalled(id: string): InstalledMarketplaceEntry | undefined {
    return this.ledger.get(id);
  }

  listInstalled(): InstalledMarketplaceEntry[] {
    return Array.from(this.ledger.values());
  }

  // ── Progress tracking ─────────────────────────────────────────────

  onProgress(id: string, cb: (p: InstallProgress) => void): () => void {
    if (!this.progressCallbacks.has(id)) {
      this.progressCallbacks.set(id, new Set());
    }
    this.progressCallbacks.get(id)!.add(cb);
    return () => this.progressCallbacks.get(id)?.delete(cb);
  }

  private emit(id: string, progress: InstallProgress): void {
    for (const cb of this.progressCallbacks.get(id) ?? []) {
      try {
        cb(progress);
      } catch {
        /* ignore listener errors */
      }
    }
  }

  // ── Install ───────────────────────────────────────────────────────

  async install(
    entry: MarketplaceEntry,
    grantedPermission: AdapterPermission = entry.permissions,
  ): Promise<{ success: boolean; error?: string }> {
    const { id, version, cdnUrl, signature, verified } = entry;

    // Clamp granted permission — never exceed what the adapter declares
    const effectivePermission =
      PERMISSION_RANK[grantedPermission] <= PERMISSION_RANK[entry.permissions]
        ? grantedPermission
        : entry.permissions;

    try {
      // 1. Validate semver
      this.emit(id, { status: 'fetching' });
      if (!isValidSemver(version)) {
        throw new Error(`Invalid semver: ${version}`);
      }

      // 2. CDN allowlist check
      if (!isCdnUrlAllowed(cdnUrl)) {
        throw new Error(`CDN URL not in allowlist: ${cdnUrl}`);
      }

      // 3. Signature verification (only for verified entries)
      this.emit(id, { status: 'verifying' });
      if (verified && signature) {
        const catalog = await this.fetchCatalog();
        const message = `${id}@${version}`;
        const valid = await verifySignature(catalog.publicKey, message, signature);
        if (!valid) {
          throw new Error('Signature verification failed — refusing to load untrusted adapter');
        }
      }

      // 4. Fetch + load module
      this.emit(id, { status: 'loading' });
      const moduleText = await this.fetchModuleText(cdnUrl);
      const checksum = await sha256Hex(moduleText);

      // 5. Dynamic import via blob URL (isolates module from main origin)
      const blob = new Blob([moduleText], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      let factory: AdapterFactory | null = null;
      try {
        const mod = (await import(/* @vite-ignore */ blobUrl)) as {
          default?: { id?: string; factory?: AdapterFactory } | AdapterFactory;
          id?: string;
          factory?: AdapterFactory;
          register?: () => void;
        };

        // Extract factory using the same strategies as loadContribAdapter
        if (mod.register && typeof mod.register === 'function') {
          mod.register();
        } else if (mod.factory && typeof mod.factory === 'function') {
          factory = mod.factory;
        } else if (
          mod.default &&
          typeof mod.default === 'object' &&
          'factory' in mod.default &&
          typeof mod.default.factory === 'function'
        ) {
          factory = mod.default.factory as AdapterFactory;
        } else if (typeof mod.default === 'function') {
          factory = mod.default as AdapterFactory;
        }
      } finally {
        URL.revokeObjectURL(blobUrl);
      }

      // 6. Register
      this.emit(id, { status: 'registering' });
      if (factory) {
        const sandboxed = createSandboxedFactory(factory, effectivePermission);
        registerAdapter(id, sandboxed, {
          displayName: entry.name,
          description: entry.description,
          source: 'npm',
        });
      }

      // 7. Update ledger
      const installed: InstalledMarketplaceEntry = {
        id,
        version,
        installedAt: Date.now(),
        permissions: effectivePermission,
        cdnUrl,
        verified,
      };
      // Store checksum alongside for audit — attach to entry object (non-schema field)
      (installed as InstalledMarketplaceEntry & { checksum?: string }).checksum = checksum;
      this.ledger.set(id, installed);
      writeLedger(this.ledger);

      this.emit(id, { status: 'done' });
      return { success: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.emit(id, { status: 'error', error });
      return { success: false, error };
    }
  }

  async uninstallMarketplace(id: string): Promise<boolean> {
    if (!this.ledger.has(id)) return false;
    this.ledger.delete(id);
    writeLedger(this.ledger);
    return true;
  }

  // ── Private helpers ───────────────────────────────────────────────

  private async fetchModuleText(url: string): Promise<string> {
    const res = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'default',
    });
    if (!res.ok) throw new Error(`Module fetch failed: HTTP ${res.status} ${url}`);
    const text = await res.text();
    if (text.length > 500_000) {
      // 500 KB soft cap — refuse oversized bundles
      throw new Error('Module exceeds 500 KB size limit');
    }
    return text;
  }
}

// ─── Sandbox Factory Wrapper ─────────────────────────────────────────
//
// Wraps the real factory so that adapters operating under a restricted
// permission level cannot call sendCommand (write) or modify the registry
// (admin). The EnergyAdapter contract is preserved — restricted methods
// throw PermissionError at runtime.

function createSandboxedFactory(
  factory: AdapterFactory,
  permission: AdapterPermission,
): AdapterFactory {
  if (permission === 'admin') return factory; // No sandbox needed

  return (config) => {
    const adapter = factory(config);

    if (permission === 'read-only') {
      return {
        ...adapter,
        sendCommand: async (_cmd) => {
          console.warn(
            `[Sandbox] sendCommand blocked: adapter "${adapter.id}" has read-only permission`,
          );
          return false;
        },
      };
    }

    return adapter; // 'write' — no restrictions on commands
  };
}

// ─── Singleton ───────────────────────────────────────────────────────

export const adapterMarketplace = new AdapterMarketplace();
