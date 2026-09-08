/**
 * ShipHandshakeService — SHIP v1.0.1 state machine for EEBUS device pairing.
 *
 * Implements the SHIP (Smart Home IP) transport layer for EEBUS SPINE messages.
 * Handles TLS 1.3 mTLS connection, SKI verification, HELLO exchange, and PIN pairing.
 *
 * Reference: SHIP v1.0.1 specification (EEBus Initiative e.V.), VDE-AR-E 2829-6
 * Port: 4712 (IANA registered EEBUS SHIP port)
 */

import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, X509Certificate } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import https from 'https';
import { dirname, relative, resolve } from 'path';
import { type RawData, WebSocket } from 'ws';
import { isLiveHardwareAllowed } from '../config/adapter-mode.js';
import { recordEebusHandshake } from '../middleware/security-metrics.js';
import { upsertDevice } from './EEBusTrustStore.js';

// ─── Types ─────────────────────────────────────────────────────────

/** SHIP handshake connection states (SHIP v1.0.1 §7.3) */
export type SHIPState =
  | 'init'
  | 'tls_connecting'
  | 'tls_connected'
  | 'cmi_hello'
  | 'protocol'
  | 'pin_required'
  | 'pin_submitted'
  | 'connected'
  | 'failed'
  | 'timeout';

export interface SHIPHandshakeEntry {
  ski: string;
  state: SHIPState;
  message?: string;
  pinHint?: string;
  hostname: string;
  port: number;
  startedAt: number;
  ws?: WebSocket;
  pinResolve?: (pin: string) => void;
  /** Number of failed PIN attempts in this session */
  pinAttempts: number;
}

// ─── Constants ─────────────────────────────────────────────────────

const CERT_FILE = resolve(
  process.cwd(),
  process.env.EEBUS_CERT_FILE ?? 'data/eebus-server.cert.pem',
);
const KEY_FILE = resolve(process.cwd(), process.env.EEBUS_KEY_FILE ?? 'data/eebus-server.key.pem');
const CA_FILE = process.env.EEBUS_CA_FILE
  ? resolve(process.cwd(), process.env.EEBUS_CA_FILE)
  : null;

/** Reject cert/key paths that escape the project root (mitigates EEBUS_*_FILE injection). */
function assertResolvedPathUnderCwd(absPath: string, label: string): void {
  const root = resolve(process.cwd());
  const rel = relative(root, absPath);
  if (rel.startsWith('..') || rel === '..') {
    throw new Error(`[SHIP] ${label} must resolve under process.cwd() (got ${absPath})`);
  }
}

assertResolvedPathUnderCwd(CERT_FILE, 'EEBUS_CERT_FILE');
assertResolvedPathUnderCwd(KEY_FILE, 'EEBUS_KEY_FILE');
if (CA_FILE) assertResolvedPathUnderCwd(CA_FILE, 'EEBUS_CA_FILE');

/** Total handshake timeout (ms). Connection enters 'timeout' state if exceeded. */
const HANDSHAKE_TIMEOUT_MS = 60_000;

/** Maximum failed PIN attempts per session before session is terminated */
const MAX_PIN_ATTEMPTS = 3;

/** SHIP message type identifiers (SHIP v1.0.1 §7.3) */
const SHIP_MSG_HELLO = '"CMI_HEAD_MESSAGE"';
const SHIP_MSG_PIN_REQ = '"PIN_STATE_REQUEST"';
const SHIP_MSG_ACCESS = '"ACCESS_METHODS_RESPONSE"';

// ─── Server Certificate ────────────────────────────────────────────

let _certPem: string | null = null;
let _keyPem: string | null = null;

/** Returns true when value looks like PEM material (non-empty). */
function hasPemMaterial(value?: string): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  return trimmed.startsWith('-----BEGIN ') || /^[A-Za-z0-9+/=\s]+$/.test(trimmed);
}

async function loadOrGenerateCert(): Promise<{ cert: string; key: string }> {
  if (_certPem && _keyPem) {
    if (!hasPemMaterial(_certPem) && isLiveHardwareAllowed()) {
      throw new Error(
        'EEBUS server certificate is empty — configure EEBUS_CERT_FILE before live SHIP',
      );
    }
    return { cert: _certPem, key: _keyPem };
  }
  try {
    _certPem = await readFile(CERT_FILE, 'utf-8');
    _keyPem = await readFile(KEY_FILE, 'utf-8');
    if (!hasPemMaterial(_certPem) || !hasPemMaterial(_keyPem)) {
      throw new Error('EEBUS cert/key files exist but contain no valid PEM material');
    }
    return { cert: _certPem, key: _keyPem };
  } catch (readErr) {
    if (isLiveHardwareAllowed()) {
      throw new Error(
        `[SHIP] Live hardware requires valid EEBUS_CERT_FILE and EEBUS_KEY_FILE: ${String(readErr)}`,
      );
    }
    // Generate ECDSA P-256 self-signed certificate (SHIP preferred curve)
    console.info('[SHIP] Generating ECDSA P-256 server certificate...');
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    // Build a minimal self-signed certificate via Node's crypto APIs
    // Use node-forge or a similar library in production for full X.509 support.
    // Here we create a minimal DER structure and wrap in PEM for compatibility.
    const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

    // Fallback: create a temporary cert using openssl subprocess only if available
    // For environments where openssl is not available, we log a warning and use
    // a pre-baked test certificate (NOT for production use).
    try {
      const tmpDir = dirname(CERT_FILE);
      await mkdir(tmpDir, { recursive: true });
      const openssl = spawnSync(
        'openssl',
        [
          'req',
          '-x509',
          '-newkey',
          'ec',
          '-pkeyopt',
          'ec_paramgen_curve:prime256v1',
          '-keyout',
          KEY_FILE,
          '-out',
          CERT_FILE,
          '-days',
          '3650',
          '-nodes',
          '-subj',
          '/CN=nexus-hems-eebus/O=Nexus HEMS',
        ],
        { stdio: 'pipe', shell: false, encoding: 'utf-8' },
      );
      if (openssl.error) throw openssl.error;
      if (openssl.status !== 0) {
        throw new Error(openssl.stderr?.trim() || `openssl exited ${String(openssl.status)}`);
      }
      _certPem = await readFile(CERT_FILE, 'utf-8');
      _keyPem = await readFile(KEY_FILE, 'utf-8');
      if (!hasPemMaterial(_certPem) || !hasPemMaterial(_keyPem)) {
        throw new Error('Generated EEBUS certificate files are empty');
      }
      console.info('[SHIP] Server certificate generated at', CERT_FILE);
      return { cert: _certPem, key: _keyPem };
    } catch {
      if (isLiveHardwareAllowed()) {
        throw new Error(
          '[SHIP] Cannot generate EEBUS TLS material in live mode without openssl — provide EEBUS_CERT_FILE/EEBUS_KEY_FILE',
        );
      }
      // openssl not available — dev/mock only: refuse empty cert handshake
      console.warn(
        '[SHIP] openssl not available. Writing key only; SHIP TLS disabled until cert files are provided.',
      );
      await mkdir(dirname(KEY_FILE), { recursive: true });
      await writeFile(KEY_FILE, keyPem, { mode: 0o600 });
      void publicKey;
      _keyPem = keyPem;
      throw new Error(
        '[SHIP] EEBUS server certificate unavailable — install openssl or mount PEM files',
      );
    }
  }
}

async function loadTrustedCaBundle(): Promise<string | undefined> {
  if (!CA_FILE) return undefined;
  return readFile(CA_FILE, 'utf-8');
}

// ─── SKI Extraction ────────────────────────────────────────────────

/**
 * Extract the Subject Key Identifier from a peer certificate.
 * Returns hex string without colons, lowercase. Falls back to SHA-256 fingerprint.
 */
function extractSKI(rawDerCert: Buffer): string {
  try {
    const cert = new X509Certificate(rawDerCert);
    // subjectKeyIdentifier is available in Node.js ≥ 17.7.0 but not in all @types/node versions
    const ski = (cert as unknown as Record<string, unknown>).subjectKeyIdentifier;
    if (typeof ski === 'string' && ski.length > 0) {
      return ski.replace(/:/g, '').toLowerCase();
    }
    // Fallback: use SHA-256 fingerprint
    return cert.fingerprint256.replace(/:/g, '').toLowerCase();
  } catch {
    return '';
  }
}

type SHIPPeerCertificate = {
  raw?: Buffer;
  fingerprint256?: string;
};

function getPeerCertificateSKI(peerCertificate: SHIPPeerCertificate): string {
  if (peerCertificate.raw) {
    return extractSKI(peerCertificate.raw);
  }
  if (
    typeof peerCertificate.fingerprint256 === 'string' &&
    peerCertificate.fingerprint256.length > 0
  ) {
    return peerCertificate.fingerprint256.replace(/:/g, '').toLowerCase();
  }
  return '';
}

// ─── Active Sessions ───────────────────────────────────────────────

/** In-flight handshake sessions keyed by SKI */
const sessions = new Map<string, SHIPHandshakeEntry>();

// ─── Handshake Implementation ──────────────────────────────────────

/**
 * Initiate a SHIP handshake to the device at host:port.
 * The caller should poll `getHandshakeState(ski)` to track progress.
 * The handshake runs asynchronously after this function returns.
 *
 * @param ski      Expected SKI of the target device (hex, no colons)
 * @param hostname Target host (must be private/local network)
 * @param port     Target port (default 4712)
 */
export async function initiateHandshake(ski: string, hostname: string, port = 4712): Promise<void> {
  // If an active session exists, do nothing
  if (sessions.has(ski)) return;

  const entry: SHIPHandshakeEntry = {
    ski,
    hostname,
    port,
    state: 'tls_connecting',
    startedAt: Date.now(),
    pinAttempts: 0,
  };
  sessions.set(ski, entry);

  // Persist as pending in trust store
  await upsertDevice({
    ski,
    hostname,
    port,
    status: 'pending',
    trustedAt: 0,
  });

  // Run handshake asynchronously — errors update state to 'failed'
  runHandshake(entry).catch((err: unknown) => {
    console.error('[SHIP] Unexpected error in handshake for', ski, err);
    entry.state = 'failed';
    entry.message = String(err);
    cleanupSession(entry);
  });
}

async function runHandshake(entry: SHIPHandshakeEntry): Promise<void> {
  const { ski, hostname, port } = entry;

  let serverCert: string;
  let serverKey: string;
  let trustedCaBundle: string | undefined;
  try {
    const certs = await loadOrGenerateCert();
    serverCert = certs.cert;
    serverKey = certs.key;
    trustedCaBundle = await loadTrustedCaBundle();
  } catch (err) {
    entry.state = 'failed';
    entry.message = `Failed to load SHIP TLS material: ${String(err)}`;
    return;
  }

  if (!hasPemMaterial(serverCert) || !hasPemMaterial(serverKey)) {
    entry.state = 'failed';
    entry.message = 'EEBUS server TLS certificate or key is missing — SHIP mTLS refused';
    return;
  }

  const tlsAgent = new https.Agent({
    cert: serverCert,
    key: serverKey,
    ...(trustedCaBundle ? { ca: trustedCaBundle } : {}),
    rejectUnauthorized: true,
    checkServerIdentity: (_servername: string, peerCertificate: SHIPPeerCertificate) => {
      const peerSKI = getPeerCertificateSKI(peerCertificate);
      if (!peerSKI) {
        return new Error('Peer certificate did not expose an SKI or fingerprint');
      }
      if (peerSKI !== ski) {
        return new Error(`SKI mismatch: expected ${ski}, got ${peerSKI}`);
      }
      return undefined;
    },
    minVersion: 'TLSv1.3',
    maxVersion: 'TLSv1.3',
  } as unknown as https.AgentOptions);

  const url = `wss://${hostname}:${port}/ship/`;

  let ws: WebSocket;
  try {
    ws = new WebSocket(url, ['ship'], {
      agent: tlsAgent,
    } as ConstructorParameters<typeof WebSocket>[2]);
  } catch (err) {
    entry.state = 'failed';
    entry.message = `WebSocket creation failed: ${String(err)}`;
    return;
  }

  entry.ws = ws;

  // Set global timeout
  const timeoutHandle = setTimeout(() => {
    if (entry.state !== 'connected' && entry.state !== 'failed') {
      entry.state = 'timeout';
      entry.message = 'Handshake timed out';
      ws.terminate();
      cleanupSession(entry);
    }
  }, HANDSHAKE_TIMEOUT_MS);

  return new Promise<void>((resolve) => {
    ws.on('open', () => {
      // Verify SKI from peer certificate via the underlying TLS socket
      const tlsSocket = (ws as unknown as { _socket?: unknown })._socket as
        | {
            getPeerCertificate?: (detailed: boolean) => { raw?: Buffer };
          }
        | undefined;
      if (tlsSocket?.getPeerCertificate) {
        const peerCert = tlsSocket.getPeerCertificate(true);
        if (peerCert?.raw) {
          const peerSKI = extractSKI(peerCert.raw);
          if (peerSKI && peerSKI !== ski) {
            entry.state = 'failed';
            entry.message = `SKI mismatch: expected ${ski}, got ${peerSKI}`;
            ws.terminate();
            clearTimeout(timeoutHandle);
            cleanupSession(entry);
            resolve();
            return;
          }
        }
      }
      entry.state = 'cmi_hello';

      // Send SHIP ConnectionHello message
      const helloMsg = JSON.stringify({
        connectionHello: [{ phase: 'ready', waiting: false }],
      });
      ws.send(helloMsg);
    });

    ws.on('message', (data: Buffer | string) => {
      const raw = typeof data === 'string' ? data : data.toString('utf-8');
      handleShipMessage(entry, raw, ws, resolve, clearTimeout.bind(null, timeoutHandle));
    });

    ws.on('error', (err: Error) => {
      entry.state = 'failed';
      entry.message = `WebSocket error: ${err.message}`;
      clearTimeout(timeoutHandle);
      cleanupSession(entry);
      resolve();
    });

    ws.on('close', () => {
      if (entry.state !== 'connected' && entry.state !== 'failed' && entry.state !== 'timeout') {
        entry.state = 'failed';
        entry.message = 'Connection closed unexpectedly';
      }
      clearTimeout(timeoutHandle);
      cleanupSession(entry);
      resolve();
    });
  });
}

function handleShipMessage(
  entry: SHIPHandshakeEntry,
  raw: string,
  ws: WebSocket,
  done: () => void,
  cancelTimeout: () => void,
): void {
  const { ski } = entry;

  // Minimal JSON parse — SHIP messages are JSON-encoded
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    // Possibly binary SHIP framing — skip for now
    return;
  }

  const msgStr = raw;

  // SHIP HELLO response — proceed to protocol/access methods phase
  if (
    entry.state === 'cmi_hello' &&
    (msgStr.includes('connectionHello') || msgStr.includes(SHIP_MSG_HELLO))
  ) {
    entry.state = 'protocol';
    // Request access methods
    ws.send(JSON.stringify({ accessMethodsRequest: {} }));
    return;
  }

  // Access methods response — check if already trusted
  if (
    entry.state === 'protocol' &&
    (msgStr.includes('accessMethods') || msgStr.includes(SHIP_MSG_ACCESS))
  ) {
    // If device indicates PIN is not required (already trusted), mark connected
    if (msgStr.includes('"noPinRequired"') || msgStr.includes('"trustedDeviceList"')) {
      markConnected(entry, ws, cancelTimeout, done);
    } else {
      // PIN exchange required
      entry.state = 'pin_required';
      entry.pinHint = 'Enter the PIN shown on your EEBUS device display';
    }
    return;
  }

  // PIN state request from device
  if (msgStr.includes('pinState') || msgStr.includes(SHIP_MSG_PIN_REQ)) {
    entry.state = 'pin_required';
    entry.pinHint = 'Enter the PIN shown on your EEBUS device display';

    // Wait for PIN via submitPin()
    new Promise<string>((resolve) => {
      entry.pinResolve = resolve;
    }).then((pin) => {
      entry.state = 'pin_submitted';
      ws.send(JSON.stringify({ pinInput: { pin } }));
    });
    return;
  }

  // PIN accepted
  if (entry.state === 'pin_submitted' && msgStr.includes('"accepted"')) {
    markConnected(entry, ws, cancelTimeout, done);
    return;
  }

  // PIN rejected
  if (
    entry.state === 'pin_submitted' &&
    (msgStr.includes('"denied"') || msgStr.includes('"rejected"'))
  ) {
    entry.pinAttempts += 1;
    if (entry.pinAttempts >= MAX_PIN_ATTEMPTS) {
      entry.state = 'failed';
      entry.message = `PIN rejected after ${MAX_PIN_ATTEMPTS} attempts`;
      ws.terminate();
      cancelTimeout();
      cleanupSession(entry);
      done();
    } else {
      // Allow another PIN attempt
      entry.state = 'pin_required';
      entry.message = `PIN rejected — attempt ${entry.pinAttempts} of ${MAX_PIN_ATTEMPTS}`;
    }
    return;
  }

  // Suppress unused variable warning
  void msg;
  void ski;
}

async function markConnected(
  entry: SHIPHandshakeEntry,
  _ws: WebSocket,
  cancelTimeout: () => void,
  done: () => void,
): Promise<void> {
  entry.state = 'connected';
  entry.message = 'SHIP handshake completed';
  cancelTimeout();
  const now = Date.now();
  await upsertDevice({
    ski: entry.ski,
    hostname: entry.hostname,
    port: entry.port,
    status: 'trusted',
    trustedAt: now,
    lastConnectedAt: now,
  });
  recordEebusHandshake('success');
  // Keep session open for SPINE message exchange
  done();
}

function cleanupSession(entry: SHIPHandshakeEntry): void {
  if (entry.state === 'failed' || entry.state === 'timeout') {
    recordEebusHandshake('failure');
    upsertDevice({
      ski: entry.ski,
      hostname: entry.hostname,
      port: entry.port,
      status: 'failed',
      trustedAt: 0,
    }).catch(() => {});
    // Remove failed sessions after a delay to allow status polling
    setTimeout(() => sessions.delete(entry.ski), 30_000);
  }
}

// ─── Public State API ──────────────────────────────────────────────

/**
 * Get the current SHIP handshake state for a SKI.
 * Returns null if no session is active (device not being paired).
 */
export function getHandshakeState(ski: string): SHIPHandshakeEntry | null {
  return sessions.get(ski) ?? null;
}

/**
 * Submit a PIN for a device in `pin_required` state.
 * @returns false if the device is not in `pin_required` state.
 */
export function submitPin(ski: string, pin: string): boolean {
  const entry = sessions.get(ski);
  if (entry?.state !== 'pin_required') return false;
  if (entry.pinResolve) {
    entry.pinResolve(pin);
    delete entry.pinResolve;
  } else if (entry.ws?.readyState === WebSocket.OPEN) {
    // Direct send if ws is available
    entry.ws.send(JSON.stringify({ pinInput: { pin } }));
    entry.state = 'pin_submitted';
  }
  entry.state = 'pin_submitted';
  return true;
}

/**
 * Terminate an active session.
 */
export function terminateSession(ski: string): void {
  const entry = sessions.get(ski);
  if (entry?.ws) {
    entry.ws.terminate();
  }
  sessions.delete(ski);
  detachClientRelays(ski);
}

// ─── Browser WebSocket proxy (Milestone 2.2) ───────────────────────

/** Active browser client relays keyed by SKI */
const clientRelays = new Map<string, Set<WebSocket>>();

function detachClientRelays(ski: string): void {
  const clients = clientRelays.get(ski);
  if (!clients) return;
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.close(1011, 'Device session ended');
    }
  }
  clientRelays.delete(ski);
}

function registerRelay(ski: string, deviceWs: WebSocket, clientWs: WebSocket): void {
  const onDeviceMessage = (data: RawData) => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data);
  };
  const onClientMessage = (data: RawData) => {
    if (deviceWs.readyState === WebSocket.OPEN) deviceWs.send(data);
  };

  deviceWs.on('message', onDeviceMessage);
  clientWs.on('message', onClientMessage);

  clientWs.on('close', () => {
    deviceWs.off('message', onDeviceMessage);
    clientRelays.get(ski)?.delete(clientWs);
  });

  if (!clientRelays.has(ski)) clientRelays.set(ski, new Set());
  clientRelays.get(ski)!.add(clientWs);
}

async function waitForTerminalHandshakeState(
  ski: string,
  timeoutMs = HANDSHAKE_TIMEOUT_MS,
): Promise<SHIPState | 'missing'> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const entry = sessions.get(ski);
    if (!entry) return 'missing';
    if (
      entry.state === 'connected' ||
      entry.state === 'pin_required' ||
      entry.state === 'failed' ||
      entry.state === 'timeout'
    ) {
      return entry.state;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return 'timeout';
}

/**
 * Attach a browser WebSocket client to the server-side SHIP session for `ski`.
 * Initiates handshake when no connected session exists.
 */
export async function attachClientRelay(
  ski: string,
  hostname: string,
  port: number,
  clientWs: WebSocket,
): Promise<'ok' | 'pin_required' | 'failed'> {
  let entry = sessions.get(ski);
  if (entry?.state !== 'connected' || entry.ws?.readyState !== WebSocket.OPEN) {
    await initiateHandshake(ski, hostname, port);
    const terminal = await waitForTerminalHandshakeState(ski);
    if (terminal === 'pin_required') return 'pin_required';
    if (terminal !== 'connected') return 'failed';
    entry = sessions.get(ski);
  }

  if (!entry?.ws || entry.ws.readyState !== WebSocket.OPEN) return 'failed';
  registerRelay(ski, entry.ws, clientWs);
  return 'ok';
}
