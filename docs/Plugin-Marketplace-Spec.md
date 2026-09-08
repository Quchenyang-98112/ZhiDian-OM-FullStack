# Plugin Marketplace Specification — Nexus-HEMS-Dash

> **Status:** Specification complete — Implementation deferred to v1.3.0
> **Created:** 2026-04-25
> **Decision (D4):** Spec in v1.2.0; Implementation begins in v1.3.0
> **Owner:** @qnbs

This document specifies the architecture, security model, API, and developer workflow for the
Nexus-HEMS Adapter Plugin Marketplace — enabling community-contributed protocol adapters to be
distributed, installed, and hot-loaded into the dashboard at runtime.

---

## 1. Goals

1. Enable third-party developers to publish protocol adapters as npm packages
2. Allow users to browse, install, update, and remove adapters from the Settings UI
3. Ensure installed plugins cannot access data or APIs outside their declared permissions
4. Maintain reproducible builds — adapter versions pinned via manifest + signature

---

## 2. Plugin Types

| Type | Distribution | Trust Level | Loading |
|------|-------------|-------------|---------|
| **Core adapter** | Bundled in repo | Fully trusted | Sync import |
| **Contrib adapter** | `/adapters/contrib/` in repo | Reviewed + merged | Dynamic import |
| **Community adapter** | npm package `nexus-adapter-*` | User-approved | Sandboxed Web Worker |
| **Local adapter** | File path on developer machine | Developer only | Dev mode only |

This spec focuses on **Community adapters** (untrusted third-party code).

---

## 3. Plugin Manifest (`nexus-adapter.manifest.json`)

Every community adapter package must include a manifest at package root:

```json
{
  "id": "nexus-adapter-shelly-gen3",
  "displayName": "Shelly Gen3 REST Adapter",
  "version": "1.2.0",
  "description": "Shelly Pro 3EM / Plus Plug S Gen3 via HTTP REST API",
  "author": "community-dev",
  "license": "MIT",
  "peerDependencies": {
    "nexus-hems-sdk": "^1.0.0"
  },
  "capabilities": ["meter", "switch", "energyMeter"],
  "permissions": [
    "network:fetch",
    "network:websocket"
  ],
  "configSchema": {
    "type": "object",
    "required": ["host"],
    "properties": {
      "host": { "type": "string", "format": "hostname", "description": "Shelly device IP or hostname" },
      "port": { "type": "integer", "default": 80 },
      "authEnabled": { "type": "boolean", "default": false },
      "username": { "type": "string" },
      "password": { "type": "string", "secret": true }
    }
  },
  "signature": "ed25519:BASE64_ENCODED_SIGNATURE",
  "publishedAt": "2026-03-01T00:00:00Z",
  "nexusHEMSCompatibility": ">=1.1.0"
}
```

### 3.1 Permissions Model

| Permission | Grants |
|------------|--------|
| `network:fetch` | `fetch()` to declared `allowedOrigins` only |
| `network:websocket` | WebSocket connections to declared origins only |
| `storage:read` | Read from plugin-scoped Dexie table |
| `storage:write` | Write to plugin-scoped Dexie table |
| `metrics:export` | Export custom `hems_plugin_*` metrics |
| `notifications:send` | Dispatch toast notifications to UI |

No permission grants access to:
- AI API keys
- Other plugins' storage
- User credentials or settings outside plugin config
- Command safety layer (hardware commands require explicit user approval in UI)

---

## 4. Signature Verification

All community adapters must be signed with Ed25519.

**Publication flow:**
1. Developer submits manifest + code to Nexus-HEMS Adapter Registry (GitHub)
2. Maintainer review: code audit, manifest validation, test run
3. Signing authority signs `sha256(manifest.json + index.js)` with registry private key
4. Signature stored in manifest `signature` field (ed25519:BASE64)
5. Package published to npm under `@nexus-hems-community` scope

**Verification at install (in `plugin-system.ts`):**
```typescript
async function verifyPluginSignature(manifest: AdapterManifest, code: string): Promise<boolean> {
  const publicKey = await getRegistryPublicKey(); // fetched once, cached
  const data = new TextEncoder().encode(
    JSON.stringify({ manifest: omit(manifest, ['signature']), codeHash: sha256(code) })
  );
  return crypto.subtle.verify(
    { name: 'Ed25519' },
    publicKey,
    base64ToBuffer(manifest.signature.replace('ed25519:', '')),
    data,
  );
}
```

For **development/local adapters** (dev mode only): signature check skipped with console warning.

---

## 5. Sandbox: Web Worker Isolation

Community adapter code runs in a **dedicated Web Worker** — not the main thread.

```
Main Thread         Worker Thread (sandbox)
┌─────────────────┐   postMessage    ┌─────────────────────────────────┐
│ AdapterRegistry │ ──────────────► │ PluginWorker                    │
│                 │                 │   ┌─────────────────────────────┐│
│ receiveData()   │ ◄────────────── │   │ CommunityAdapter (user code)││
│ onStatus()      │   structured    │   │   + nexus-hems-sdk shim     ││
│ sendCommand()   │   clone only    │   └─────────────────────────────┘│
└─────────────────┘                 └─────────────────────────────────┘
```

**Worker global restrictions (via `WorkerGlobalScope` replacement):**
- `fetch` allowed only to origins listed in `manifest.permissions[network:fetch]`
- `WebSocket` allowed only to origins in `manifest.permissions[network:websocket]`
- `eval`, `Function()`, `importScripts` → blocked (CSP: `worker-src 'self'`)
- DOM access → none (Worker has no DOM)
- Shared `localStorage`/`sessionStorage` → blocked (isolated via private origin)
- Cross-plugin `postMessage` → blocked (only registry ↔ worker channel)

Message protocol:
```typescript
type WorkerMessage =
  | { type: 'INIT'; config: AdapterConnectionConfig }
  | { type: 'CONNECT' }
  | { type: 'DISCONNECT' }
  | { type: 'COMMAND'; command: AdapterCommand }
  | { type: 'DESTROY' };

type WorkerResponse =
  | { type: 'DATA'; model: UnifiedEnergyModel }
  | { type: 'STATUS'; status: AdapterStatus }
  | { type: 'ERROR'; message: string }
  | { type: 'COMMAND_RESULT'; success: boolean; error?: string };
```

Activation timeout: **10 seconds** — if worker does not respond to `CONNECT` with a `STATUS` message
within 10s, it is terminated and circuit breaker opens.

---

## 6. Developer Workflow

### 6.1 Scaffold CLI (`scripts/create-adapter.mjs`)

Already implemented as `scripts/create-adapter.mjs`. Usage:

```bash
node scripts/create-adapter.mjs
# Interactive prompts:
# → Adapter ID (e.g., my-custom-protocol)
# → Display name
# → Capabilities (meter/inverter/battery/evCharger/heatPump/load)
# → Config fields
# → Generate test stub? Y/n
# → Generate Storybook story? Y/n
```

Output structure:
```
apps/web/src/core/adapters/contrib/
├── my-custom-protocol.ts           ← adapter implementation
├── my-custom-protocol.test.ts      ← Vitest unit test
└── my-custom-protocol.stories.tsx  ← Storybook story (optional)
```

### 6.2 SDK Package (`packages/nexus-hems-sdk`) — v1.3.0

A minimal npm-publishable SDK for community adapter development:

```typescript
// @nexus-hems/sdk — re-exports from shared-types + base class shim
export { BaseAdapter } from './BaseAdapter';
export type {
  EnergyAdapter, AdapterCapability, AdapterCommand,
  UnifiedEnergyModel, AdapterConnectionConfig,
} from './types';
export { AdapterStatus } from './types';
```

Community developers install `@nexus-hems/sdk` and extend `BaseAdapter`.

### 6.3 Test Requirements

Community adapters must include:
- ≥ 5 Vitest unit tests (status transitions, command validation, snapshot format)
- ≥ 1 property-based test (fast-check) for protocol parsing
- Coverage ≥ 60% (enforced by registry CI)

### 6.4 Publishing to Registry

```bash
# From adapter package root:
npm run build
npm run test:coverage   # must be ≥60%
npx nexus-adapter-publish --token <REGISTRY_TOKEN>
# → Submits PR to github.com/nexus-hems/adapter-registry
# → Maintancer review → merge → auto-sign → npm publish to @nexus-hems-community
```

---

## 7. Plugin Marketplace UI (v1.3.0)

Location: Settings page → "Adapter-Plugins" tab

### 7.1 Browse View

- Search / filter by capability, author, last updated
- Cards: adapter name, description, install count, last version, compatibility badge
- "Installieren" button → initiates signed install flow

### 7.2 Install Flow

1. User clicks "Installieren" for `nexus-adapter-shelly-gen3 v1.2.0`
2. System fetches manifest from npm registry
3. Signature verified (Ed25519) — if invalid: hard block, error shown
4. Permission review dialog shown: "Dieser Adapter benötigt Zugriff auf: Netzwerk (fetch)"
5. User clicks "Erlauben" → adapter downloaded + sandboxed in Worker
6. Config form generated from `manifest.configSchema`
7. "Verbinden" → `CONNECT` message sent, 10s timeout, status shown
8. Adapter added to AdapterRegistry, appears in Monitoring tab

### 7.3 Update / Remove

- Update: versioned diff shown (CHANGELOG from npm), re-verify signature, restart Worker
- Remove: `DISCONNECT` + `DESTROY` → Worker terminated → Dexie plugin table dropped

### 7.4 Audit Log

All plugin operations logged to IndexedDB `commandAudit` table (existing, from command-safety.ts):
- install, update, remove, permission-grant, permission-deny, signature-failure

---

## 8. Security Threat Model

| Threat | Mitigation |
|--------|-----------|
| Malicious code exfiltrates AI keys | Worker cannot access main thread IndexedDB directly |
| Adapter makes unauthenticated hardware commands | All hardware commands must pass through CommandSafetyLayer, which requires user confirmation |
| Supply-chain attack via npm | Ed25519 signature on registry-reviewed code only |
| Prototype pollution | structured-clone in all Worker messages (no prototype chain crossing) |
| DoS via infinite loop in Worker | Activation timeout (10s) + message rate limit (100 msg/min per Worker) |
| Credential theft via config form | `secret: true` fields masked in UI + routed to AES-GCM vault, never in postMessage |

---

## 9. Compatibility Matrix

| Nexus-HEMS Version | SDK Version | Plugin Manifest Schema |
|--------------------|-------------|----------------------|
| v1.1.x | — | (no community plugins yet) |
| v1.2.0 | v1.0.0 | v1 (this spec) |
| v1.3.0 | v1.0.0+ | v1 (backward-compatible) |
| v2.0.0 | v2.0.0 | v2 (breaking: new Worker protocol) |

Adapters compiled against SDK v1.0.0 are guaranteed to work on Nexus-HEMS v1.2.0 and v1.3.0.
Breaking changes in the Worker protocol are versioned separately.

---

## 10. Known Limitations (v1.2.0 Spec)

- No hot-reload of community adapters in dev mode (require page reload)
- Only npm-published adapters, no private registry support yet
- Maximum 10 concurrent community adapter Workers (browser memory constraint)
- No adapter-to-adapter communication (future: shared event bus)
- Simulator / emulator for adapter testing in CI not yet designed

These limitations are tracked in `docs/adr/ADR-009-multi-user-rbac-future.md` (future arch) and will
be addressed in v1.4.0+.
