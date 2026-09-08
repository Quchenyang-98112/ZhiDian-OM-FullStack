# EEBUS Certificate Setup Guide

This guide covers setting up TLS 1.3 mutual TLS (mTLS) certificates required for EEBUS/SPINE communication in Nexus-HEMS.

> **Adapter:** `apps/web/src/core/adapters/EEBUSAdapter.ts` · **Standard:** VDE-AR-E 2829-6

---

## Overview

EEBUS uses **SHIP** (Smart Home IP) as the transport layer. SHIP requires:

1. **TLS 1.3** for all connections (no TLS 1.2 fallback)
2. **Mutual TLS (mTLS)** — both client and server present X.509 certificates
3. **Self-signed certificates** are allowed (trust established via pairing, not CA chain)
4. **ECDSA P-256** key pair (RSA not recommended for embedded devices)
5. **mDNS** service discovery on the local network (`_ship._tcp.local.`)

---

## Certificate Generation

### Option A — OpenSSL (Manual)

```bash
# 1. Generate ECDSA P-256 private key
openssl ecparam -name prime256v1 -genkey -noout -out nexus-hems-key.pem

# 2. Generate self-signed certificate (valid 10 years)
openssl req -new -x509 -key nexus-hems-key.pem \
  -out nexus-hems-cert.pem \
  -days 3650 \
  -subj "/CN=nexus-hems/O=Nexus-HEMS/C=DE" \
  -extensions v3_req \
  -addext "subjectAltName=DNS:nexus-hems.local,IP:192.168.1.100"

# 3. Verify
openssl x509 -in nexus-hems-cert.pem -text -noout | grep -E "Subject|Validity|Signature"
```

### Option B — cert-manager (Kubernetes / Helm)

If running in Kubernetes via the Helm chart:

```yaml
# helm/nexus-hems/values.yaml — EEBUS TLS section
eebus:
  tls:
    enabled: true
    issuerRef:
      name: nexus-hems-selfsigned
      kind: Issuer
    commonName: nexus-hems
    dnsNames:
      - nexus-hems.local
    ipAddresses:
      - 192.168.1.100
    duration: 87600h   # 10 years
    renewBefore: 720h  # Renew 30 days before expiry
```

cert-manager Issuer resource:

```yaml
apiVersion: cert-manager.io/v1
kind: Issuer
metadata:
  name: nexus-hems-selfsigned
  namespace: nexus-hems
spec:
  selfSigned: {}
```

### Option C — Docker Compose

Mount pre-generated certificates:

```yaml
# docker-compose.yml
services:
  api:
    volumes:
      - ./certs/nexus-hems-cert.pem:/app/certs/eebus-cert.pem:ro
      - ./certs/nexus-hems-key.pem:/app/certs/eebus-key.pem:ro
    environment:
      EEBUS_CERT_PATH: /app/certs/eebus-cert.pem
      EEBUS_KEY_PATH: /app/certs/eebus-key.pem
```

---

## Adapter Configuration

In **Settings → Adapters → EEBUS**, configure:

```json
{
  "certPath": "/app/certs/eebus-cert.pem",
  "keyPath": "/app/certs/eebus-key.pem",
  "host": "192.168.1.50",
  "port": 4712,
  "useMDNS": true,
  "mdnsServiceType": "_ship._tcp",
  "ski": "DEVICE_SKI_FROM_PAIRING"
}
```

**SKI (Subject Key Identifier)** is the device fingerprint exchanged during pairing. It is derived from the SHA-256 hash of the device certificate's public key.

Extract your SKI:

```bash
openssl x509 -in nexus-hems-cert.pem -noout -pubkey | \
  openssl pkey -pubin -outform DER | \
  sha256sum | awk '{print $1}' | \
  sed 's/../&:/g;s/:$//'
```

---

## mDNS Discovery & Pairing

### Step 1 — Enable mDNS Discovery

Ensure the EEBUS adapter can reach the local mDNS domain. In Docker Desktop or WSL environments you may need to enable host networking:

```yaml
# docker-compose.yml
services:
  api:
    network_mode: host  # Required for mDNS on Linux
```

### Step 2 — Run EEBUS Service Discovery

In Monitoring → Adapters → EEBUS, click **Scan for SHIP Devices**. The adapter will browse `_ship._tcp.local.` and list discovered devices.

### Step 3 — Initiate Pairing

1. Click the discovered device (wallbox, heat pump, etc.)
2. The SHIP pairing handshake begins — both devices exchange SKIs.
3. **On the peer device** (e.g., KEBA wallbox): confirm the pairing code shown in the Nexus-HEMS UI.
4. After confirmation, Nexus-HEMS stores the trusted SKI in IndexedDB.

### Step 4 — Verify Connection

The EEBUSAdapter circuit breaker shows `CLOSED` (green) when successfully paired. If it shows `OPEN`, check:

- TLS certificate validity
- SKI match between both devices
- Port 4712 reachable on the target device
- No firewall blocking UDP port 5353 (mDNS)

---

## Certificate Renewal

EEBUS self-signed certs are valid for 10 years. To renew:

1. Generate a new key pair and certificate (Option A or B above).
2. Update the cert/key paths in adapter settings.
3. Re-run pairing for each connected EEBUS device (SKI changes with new cert).

---

## Security Notes

- **Never use** a CA-signed certificate from a public CA for EEBUS — the standard uses trust-on-first-use (TOFU) pairing, not CA validation.
- Certificate private key must be **read-only** (`chmod 400 nexus-hems-key.pem`).
- In production Docker, mount certs with `:ro` (read-only) volume flags.
- The EEBUSAdapter validates the peer's SKI against the stored trusted list on every connection.
- Revoke a device by removing its SKI from the trusted list in **Settings → EEBUS → Trusted Devices**.

---

## Supported EEBUS Devices

| Category | Devices | Profile |
|----------|---------|---------|
| EV Wallboxes | KEBA P30 x-series, Mennekes AMTRON, SMA EV Charger | EVCC (Electric Vehicle Charging Control) |
| Heat Pumps | Vaillant, STIEBEL, Nibe, Viessmann, Wolf, Glen Dimplex | SPINE LPC (Local Power Control) |
| Heat Pumps | All SG Ready devices with EEBUS option | SPINE HC (Heat Control) |
| Inverters | Future: SMA, Fronius with EEBUS firmware | CEM (Customer Energy Manager) |

---

*See also: [Hardware-Compatibility-Matrix.md](./Hardware-Compatibility-Matrix.md) · [Adapter-Dev-Guide.md](./Adapter-Dev-Guide.md) · [Security-Architecture.md](./Security-Architecture.md)*
