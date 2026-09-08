# EEBUS SHIP Handshake Implementation

**Status:** Implemented (v1.2.0)
**Spec reference:** VDE-AR-E 2829-6, SHIP v1.0.1 (EEBus Initiative e.V.)
**TLS version:** TLS 1.3 with mutual authentication (mTLS)
**Port:** 4712 (EEBUS standard, IANA registered)

---

## Table of Contents

1. [Protocol Overview](#1-protocol-overview)
2. [SHIP State Machine](#2-ship-state-machine)
3. [TLS 1.3 mTLS Setup](#3-tls-13-mtls-setup)
4. [SKI Extraction](#4-ski-extraction)
5. [Server Certificate Management](#5-server-certificate-management)
6. [API Endpoints](#6-api-endpoints)
7. [PIN Exchange Flow](#7-pin-exchange-flow)
8. [Trust Store Schema](#8-trust-store-schema)
9. [Frontend Integration](#9-frontend-integration)
10. [VDE-AR-E 2829-6 Compliance Notes](#10-vde-ar-e-2829-6-compliance-notes)
11. [Security Considerations](#11-security-considerations)
12. [Error Handling](#12-error-handling)

---

## 1. Protocol Overview

SHIP (Smart Home IP) is the transport layer for EEBUS SPINE messages. It runs over:

```
SPINE data model
    └── SHIP framing
         └── WebSocket (binary frames)
              └── TLS 1.3 (mTLS — both sides authenticate with X.509)
                   └── TCP port 4712
```

The **Subject Key Identifier (SKI)** in the TLS certificate uniquely identifies each EEBUS device. The pairing flow uses a **PIN** (5–6 decimal digits) displayed on the target device to establish initial trust.

---

## 2. SHIP State Machine

The state machine follows the SHIP v1.0.1 specification §7.3:

```
                   ┌─────────────────────────────────────────────────────────┐
                   │                    init                                  │
                   │  (no connection, idle)                                  │
                   └─────────────────────┬───────────────────────────────────┘
                                         │ connect(host, port, ski)
                                         ▼
                   ┌─────────────────────────────────────────────────────────┐
                   │               tls_connecting                             │
                   │  TLS 1.3 WebSocket handshake in progress                │
                   │  Timeout: 10 s                                          │
                   └──────┬──────────────────────────────────────────────────┘
                          │ TLS established         │ error / timeout
                          ▼                         ▼ → failed
                   ┌──────────────────┐
                   │  tls_connected   │
                   │  Verify SKI      │
                   │  matches request │
                   └──────┬───────────┘
                          │ SKI verified
                          ▼
                   ┌──────────────────────────────────┐
                   │           cmi_hello              │
                   │  Send SHIP Hello                 │
                   │  Wait for peer Hello response    │
                   │  Timeout: 10 s                   │
                   └──────┬───────────────────────────┘
                          │ Hello exchanged
                          ▼
                   ┌──────────────────────────────────┐
                   │           protocol               │
                   │  Negotiate SPINE protocol        │
                   │  Exchange ConnectionHello        │
                   │  Timeout: 10 s                   │
                   └──────┬────────────────────────┬──┘
                          │ already trusted         │ PIN required
                          ▼                         ▼
                   ┌────────────────┐  ┌────────────────────────────────────┐
                   │   connected    │  │          pin_required              │
                   │  Full SPINE    │  │  Device is not yet trusted         │
                   │  messaging     │  │  Waiting for PIN from operator     │
                   │  active        │  │  (UI notified via status endpoint) │
                   └────────────────┘  └──────────────────┬─────────────────┘
                                                          │ POST /api/eebus/pair/pin
                                                          ▼
                                       ┌──────────────────────────────────────┐
                                       │           pin_submitted              │
                                       │  PIN transmitted to device           │
                                       │  Awaiting device acceptance          │
                                       │  Timeout: 30 s                       │
                                       └──────────────────┬───────────────────┘
                                                          │
                                          ┌───────────────┼──────────────┐
                                          │ accepted      │ rejected     │
                                          ▼               ▼              │
                                   ┌────────────┐  ┌──────────┐         │
                                   │ connected  │  │  failed  │◄────────┘
                                   └────────────┘  └──────────┘
```

### State Descriptions

| State | Description |
|---|---|
| `init` | No active connection. Device record may exist in trust store. |
| `tls_connecting` | TLS 1.3 WebSocket handshake in progress. |
| `tls_connected` | TLS connected. SKI from peer certificate being verified. |
| `cmi_hello` | SHIP ConnectionHello exchange (both sides send HELLO message). |
| `protocol` | Protocol negotiation phase. Access methods and entity lists exchanged. |
| `pin_required` | Device requires PIN entry before trust can be established. |
| `pin_submitted` | PIN has been sent to device, awaiting acknowledgement. |
| `connected` | Fully connected. SPINE CEM/EMS messages can flow. |
| `failed` | Connection failed (TLS error, SKI mismatch, PIN reject, timeout). |
| `timeout` | Specific failure sub-state: connection timed out before completion. |

---

## 3. TLS 1.3 mTLS Setup

Both the Nexus server and the EEBUS device present X.509 certificates during the TLS handshake. Neither side uses traditional CA chains — trust is established via **SKI fingerprint matching** after the PIN exchange.

### Node.js TLS Options

```typescript
import https from 'https';
import { readFileSync } from 'fs';

const tlsOptions: https.AgentOptions = {
  cert: readFileSync(process.env.EEBUS_CERT_FILE ?? 'data/eebus-server.cert.pem'),
  key:  readFileSync(process.env.EEBUS_KEY_FILE  ?? 'data/eebus-server.key.pem'),
  // mTLS — request peer cert. We do NOT verify against a CA;
  // SKI fingerprint matching replaces CA verification (SHIP spec §5.2).
  rejectUnauthorized: false,
  minVersion: 'TLSv1.3' as const,
  maxVersion: 'TLSv1.3' as const,
  // SHIP-required cipher suite
  ciphers: 'TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384',
};
```

### Auto-Generated Server Certificate

If no cert file is found at the configured path, `ShipHandshakeService` automatically generates an ECDSA P-256 self-signed certificate using the Node.js `crypto` module. The generated cert/key are written to `data/eebus-server.cert.pem` and `data/eebus-server.key.pem` for reuse across restarts.

```bash
# Manual generation (OpenSSL)
openssl ecparam -genkey -name prime256v1 -noout -out eebus-server.key.pem
openssl req -new -key eebus-server.key.pem -x509 -nodes \
  -days 3650 -out eebus-server.cert.pem \
  -subj "/CN=nexus-hems-eebus/O=Nexus HEMS"
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `EEBUS_CERT_FILE` | `data/eebus-server.cert.pem` | Path to server TLS certificate (PEM) |
| `EEBUS_KEY_FILE` | `data/eebus-server.key.pem` | Path to server TLS private key (PEM) |
| `EEBUS_TRUST_FILE` | `data/eebus-trust.json` | Path to device trust store JSON file (when `EEBUS_TRUST_BACKEND=file`) |
| `EEBUS_TRUST_BACKEND` | `file` | `file` — JSON trust store; `redis` — shared entries via `REDIS_URL` for multi-replica API |

---

## 4. SKI Extraction

The Subject Key Identifier (SKI) is extracted from the peer certificate's `subjectKeyIdentifier` extension. The raw value is hex-encoded without colons, all lowercase. This matches the mDNS TXT record `ski=` field that EEBUS devices advertise.

```typescript
import { X509Certificate } from 'crypto';

function extractSKI(rawDerCert: Buffer): string | null {
  try {
    const cert = new X509Certificate(rawDerCert);
    const skiExt = cert.subjectKeyIdentifier;
    if (!skiExt) return null;
    // subjectKeyIdentifier value is hex with colons: "ab:cd:ef:..."
    // Normalise: remove colons, lowercase
    return skiExt.replace(/:/g, '').toLowerCase();
  } catch {
    return null;
  }
}
```

If the peer certificate has no SKI extension, the SHA-256 fingerprint of the entire certificate DER is used as a fallback identifier.

---

## 5. Server Certificate Management

### Certificate Lifecycle

1. **Startup**: `ShipHandshakeService.initialize()` loads or generates the server cert.
2. **mDNS advertisement**: The server SKI is included in the TXT record for `_ship._tcp.local.` mDNS broadcasts (future feature).
3. **Rotation**: Certificates must be rotated before expiry. Running `scripts/rotate-eebus-cert.sh` (future) regenerates and writes the new cert without downtime.

### SKI Derivation from Server Cert

```typescript
function getServerSKI(certPem: string): string {
  const cert = new X509Certificate(certPem);
  return (cert.subjectKeyIdentifier ?? cert.fingerprint256)
    .replace(/:/g, '')
    .toLowerCase();
}
```

---

## 6. API Endpoints

All endpoints require JWT authentication (`Authorization: Bearer <token>`). Pair/PIN/delete operations require `admin` scope.

### Existing Endpoints

| Method | Path | Scope | Description |
|---|---|---|---|
| `GET` | `/api/eebus/discover` | `read` | List mDNS-discovered EEBUS devices |
| `POST` | `/api/eebus/pair` | `admin` | Initiate SHIP handshake to device |

### New Endpoints (v1.2.0)

| Method | Path | Scope | Description |
|---|---|---|---|
| `POST` | `/api/eebus/pair/pin` | `admin` | Submit PIN for `pin_required` state |
| `GET` | `/api/eebus/pair/status/:ski` | `read` | Poll SHIP connection state for SKI |
| `GET` | `/api/eebus/trust` | `read` | List all trusted devices from trust store |
| `DELETE` | `/api/eebus/trust/:ski` | `admin` | Remove device from trust store |

### POST /api/eebus/pair

**Request body:**
```json
{ "ski": "a1b2c3d4e5f6..." }
```

**Response (202 Accepted — handshake initiated):**
```json
{
  "status": "connecting",
  "ski": "a1b2c3d4e5f6...",
  "message": "SHIP handshake initiated"
}
```

**Response (202 — PIN required):**
```json
{
  "status": "pin_required",
  "ski": "a1b2c3d4e5f6...",
  "message": "Device requires PIN entry",
  "pinHint": "Enter the 5-digit code shown on the device display"
}
```

### POST /api/eebus/pair/pin

**Request body:**
```json
{ "ski": "a1b2c3d4e5f6...", "pin": "12345" }
```

**Response (202 Accepted):**
```json
{ "status": "pin_submitted", "ski": "a1b2c3d4e5f6..." }
```

### GET /api/eebus/pair/status/:ski

Intended for polling from the frontend (every 2 s) until state is `connected` or `failed`.

**Response (200 OK):**
```json
{
  "status": "pin_required",
  "ski": "a1b2c3d4e5f6...",
  "pinHint": "Enter the 6-digit code on the device display"
}
```

### GET /api/eebus/trust

**Response (200 OK):**
```json
[
  {
    "ski": "a1b2c3d4e5f6...",
    "hostname": "heatpump.local",
    "port": 4712,
    "brand": "Vaillant",
    "model": "aroTHERM plus 7",
    "deviceType": "HeatPump",
    "status": "connected",
    "trustedAt": 1720000000000,
    "lastConnectedAt": 1720001000000
  }
]
```

### DELETE /api/eebus/trust/:ski

**Response (204 No Content)** on success.
**Response (404 Not Found)** if SKI not in trust store.

---

## 7. PIN Exchange Flow

```
UI (browser)          API Server                EEBUS Device
    │                      │                         │
    │  POST /pair {ski}     │                         │
    │──────────────────────►│                         │
    │                      │  TLS 1.3 WebSocket       │
    │                      │─────────────────────────►│
    │                      │  SHIP HELLO              │
    │  202 connecting      │◄─────────────────────────│
    │◄──────────────────────│  SHIP HELLO reply       │
    │                      │                         │
    │  GET /status/:ski     │                         │
    │──────────────────────►│                         │
    │                      │  (state: pin_required)  │
    │  {status:pin_required}│                         │
    │◄──────────────────────│                         │
    │                      │                         │
    │ [User reads PIN from device display]            │
    │                      │                         │
    │  POST /pair/pin       │                         │
    │  {ski, pin:"12345"}   │                         │
    │──────────────────────►│                         │
    │                      │  SHIP PIN msg           │
    │                      │─────────────────────────►│
    │  202 pin_submitted    │  PIN ACK / NACK        │
    │◄──────────────────────│◄─────────────────────────│
    │                      │                         │
    │  GET /status/:ski     │                         │
    │──────────────────────►│                         │
    │  {status:connected}   │                         │
    │◄──────────────────────│                         │
```

### PIN Format

- **5 or 6 decimal digits** (`\d{5,6}`)
- Displayed on the EEBUS device's own UI (display, app, or LED code)
- One-time use — invalidated after successful pairing or after 120 s timeout

---

## 8. Trust Store Schema

The trust store is persisted as a JSON file at `data/eebus-trust.json`. Writes are **atomic** (write to `.tmp`, then `rename`). The file is read on startup.

### File Format

```json
{
  "version": 1,
  "devices": [
    {
      "ski": "a1b2c3d4e5f6...",
      "hostname": "heatpump.local",
      "port": 4712,
      "brand": "Vaillant",
      "model": "aroTHERM plus 7",
      "deviceType": "HeatPump",
      "status": "connected",
      "trustedAt": 1720000000000,
      "lastConnectedAt": 1720001000000
    }
  ]
}
```

### EEBUSDeviceRecord (Frontend — Dexie v13)

```typescript
interface EEBUSDeviceRecord {
  ski: string;          // Primary key (IndexedDB)
  hostname: string;
  port: number;
  certPem?: string;     // Peer certificate PEM (for display only)
  trustedAt: number;    // Unix ms
  lastConnectedAt?: number;
  status: 'trusted' | 'pending' | 'failed';
  brand?: string;
  model?: string;
  deviceType?: string;
}
```

**Dexie table index:** `'&ski, status, trustedAt'`

---

## 9. Frontend Integration

### PIN Dialog Flow

The frontend polls `GET /api/eebus/pair/status/:ski` every 2 seconds after initiating pairing. When the state transitions to `pin_required`, a Radix UI Dialog is displayed:

```
┌─────────────────────────────────┐
│   SHIP Pairing — PIN Required   │
│                                 │
│  Enter the PIN displayed on     │
│  your device:                   │
│                                 │
│  ┌─────────────────────────┐    │
│  │  _ _ _ _ _              │    │
│  └─────────────────────────┘    │
│                                 │
│  [Cancel]        [Submit PIN]   │
└─────────────────────────────────┘
```

### Trust Store Tab

A new "Trust Store" section in `CertificateManagement.tsx` shows all paired EEBUS devices from `GET /api/eebus/trust` alongside the existing local cert import/export. Each device entry has a "Remove Trust" button that calls `DELETE /api/eebus/trust/:ski`.

---

## 10. VDE-AR-E 2829-6 Compliance Notes

| Requirement | Implementation |
|---|---|
| TLS 1.3 mandatory | `minVersion: 'TLSv1.3'`, no TLS 1.2 fallback |
| mTLS (both sides present certificates) | `requestCert: true` on WebSocket server |
| SKI-based identity (no CA chain required) | SKI extracted from `X509Certificate.subjectKeyIdentifier` |
| PIN-based initial trust (CEM pairing) | `pin_required` state + POST `/pair/pin` endpoint |
| Persistent trust store | Atomic JSON file writes (`rename()` for atomicity) |
| Certificate renewal without re-pairing | Trust stored by SKI; re-pairing only needed if SKI changes |
| Port 4712 | Standard EEBUS SHIP port (IANA registered) |

---

## 11. Security Considerations

### SKI Pinning

Once a device is paired, its SKI is stored in the trust store. Subsequent connections are accepted **only if** the peer certificate's SKI matches the stored value. This prevents man-in-the-middle attacks where an attacker presents a different certificate.

### No CA Dependency

EEBUS explicitly does NOT use traditional PKI/CA chains. Each device is its own root of trust. The PIN exchange is the bootstrapping mechanism.

### PIN Brute Force Protection

The `ShipHandshakeService` enforces a **3-attempt limit** per pairing session. After 3 failed PIN submissions, the connection is terminated and the device enters a 60-second cooldown.

### Private Network Only

The `POST /api/eebus/pair` endpoint validates that the target host is a private/local address (RFC 1918, link-local, `.local` mDNS) before initiating a TLS connection. This prevents SSRF attacks.

### Scope Gate

All mutating EEBUS endpoints require `admin` scope. The read-only `discover`, `trust`, and `status` endpoints require `read` scope.

---

## 12. Error Handling

| Error | HTTP Status | Description |
|---|---|---|
| Invalid SKI format | 400 | SKI must be 4–128 hex chars |
| Unknown SKI | 404 | Device not discovered or not in trust store |
| TLS connection failed | 502 | Target device unreachable or cert error |
| SKI mismatch | 422 | Peer certificate SKI differs from requested SKI |
| PIN rejected | 422 | Device rejected the submitted PIN |
| Pairing timeout | 504 | Handshake did not complete within 60 s |
| Private network guard | 403 | Target host is not a local/private address |

---

## Related Documents

- [EEBUS-Certificate-Setup.md](./EEBUS-Certificate-Setup.md) — OpenSSL commands for cert generation
- [Security-Architecture.md](./Security-Architecture.md) — SHIP trust model in threat model
- [docs/adr/ADR-015-eebus-ship-trust-store.md](./adr/ADR-015-eebus-ship-trust-store.md) — ADR: JSON file trust store vs database
- [API-Reference.md](./API-Reference.md) — full endpoint reference
