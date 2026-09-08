/**
 * OCPP 2.1 WebSocket relay — API holds mTLS client credentials to the CSMS.
 */

import { lookup } from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';
import { type RawData, WebSocket } from 'ws';
import { isPrivateHost } from '../config/private-host.js';
import { logger } from '../core/logger.js';
import type { OcppProxySessionData } from './ocpp-session-store.js';

/**
 * Resolve the upstream host to a pinned connection target, re-validating that it
 * is private at connect time (closes the DNS-rebind / TOCTOU window between the
 * string check at session creation and the socket open — CWE-918).
 *
 *  - IP literal  → validated directly, connected by IP (already pinned).
 *  - localhost / *.local → connected by name (loopback / mDNS is LAN-scoped and
 *    not reliably resolvable via the OS resolver; the string guard stands).
 *  - hostname    → every resolved A/AAAA record must be private; the first is
 *    pinned as the connect IP while `servername` keeps TLS SNI + cert validation
 *    bound to the original hostname.
 *
 * Returns null when the target is or resolves to anything non-private.
 */
async function resolvePinnedTarget(
  host: string,
): Promise<{ connectHost: string; servername?: string } | null> {
  if (net.isIP(host)) {
    return isPrivateHost(host) ? { connectHost: host } : null;
  }
  if (host === 'localhost' || host.toLowerCase().endsWith('.local')) {
    return isPrivateHost(host) ? { connectHost: host } : null;
  }
  try {
    const records = await lookup(host, { all: true });
    if (records.length === 0 || !records.every((r) => isPrivateHost(r.address))) {
      return null;
    }
    return { connectHost: records[0]!.address, servername: host };
  } catch {
    return null;
  }
}

function relayBidirectional(upstream: WebSocket, client: WebSocket): void {
  const onUpstreamMessage = (data: RawData) => {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  };
  const onClientMessage = (data: RawData) => {
    if (upstream.readyState === WebSocket.OPEN) upstream.send(data);
  };

  upstream.on('message', onUpstreamMessage);
  client.on('message', onClientMessage);

  const cleanup = () => {
    upstream.off('message', onUpstreamMessage);
    client.off('message', onClientMessage);
  };

  upstream.on('close', cleanup);
  client.on('close', () => {
    cleanup();
    if (upstream.readyState === WebSocket.OPEN) upstream.close();
  });
  upstream.on('error', () => {
    if (client.readyState === WebSocket.OPEN) client.close(1011, 'Upstream OCPP relay error');
  });
  client.on('error', () => {
    if (upstream.readyState === WebSocket.OPEN) upstream.close();
  });
}

/**
 * Open an mTLS WebSocket to the CSMS and relay frames to the browser client.
 */
export function attachOcppProxyRelay(
  session: OcppProxySessionData,
  clientWs: WebSocket,
): Promise<'ok' | 'failed'> {
  return new Promise((resolve) => {
    const closeClient = (reason: string) => {
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close(1011, reason);
    };

    void resolvePinnedTarget(session.host).then((pinned) => {
      if (!pinned) {
        logger.warn('OCPP proxy target rejected — host is not private at connect time', {
          host: session.host,
        });
        closeClient('OCPP target host is not a private address');
        resolve('failed');
        return;
      }

      const tlsAgent = new https.Agent({
        cert: session.clientCert,
        key: session.clientKey,
        ...(session.caCert ? { ca: session.caCert } : {}),
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        ...(pinned.servername ? { servername: pinned.servername } : {}),
      });

      const path = `/ocpp/${encodeURIComponent(session.stationId)}`;
      // Connect to the pinned IP; keep Host/SNI bound to the original hostname so
      // TLS cert validation and CSMS vhost routing still see the real name.
      const hostForUrl = net.isIPv6(pinned.connectHost)
        ? `[${pinned.connectHost}]`
        : pinned.connectHost;
      const url = `wss://${hostForUrl}:${session.port}${path}`;

      let upstream: WebSocket;
      try {
        upstream = new WebSocket(url, ['ocpp2.1'], {
          agent: tlsAgent,
          ...(pinned.servername
            ? {
                servername: pinned.servername,
                headers: { Host: `${pinned.servername}:${session.port}` },
              }
            : {}),
        } as ConstructorParameters<typeof WebSocket>[2]);
      } catch {
        resolve('failed');
        return;
      }

      const fail = () => {
        closeClient('OCPP mTLS upstream connection failed');
        resolve('failed');
      };

      upstream.on('open', () => {
        relayBidirectional(upstream, clientWs);
        resolve('ok');
      });
      upstream.on('error', fail);
      upstream.on('close', () => {
        if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
      });
    });
  });
}
