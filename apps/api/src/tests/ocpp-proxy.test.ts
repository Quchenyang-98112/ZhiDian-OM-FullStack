import type { IncomingMessage } from 'http';
import { describe, expect, it } from 'vitest';
import { isOcppProxyPath } from '../ws/ocpp-proxy.ws.js';

function mockReq(url: string): IncomingMessage {
  return { url, headers: { host: 'localhost:3000' } } as IncomingMessage;
}

describe('ocpp-proxy path routing', () => {
  it('matches /ws/ocpp', () => {
    expect(isOcppProxyPath(mockReq('/ws/ocpp?session=abc'))).toBe(true);
  });

  it('rejects energy websocket path', () => {
    expect(isOcppProxyPath(mockReq('/ws?ticket=abc'))).toBe(false);
  });
});
