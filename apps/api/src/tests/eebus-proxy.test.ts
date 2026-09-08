import type { IncomingMessage } from 'http';
import { describe, expect, it } from 'vitest';
import { isEebusProxyPath } from '../ws/eebus-proxy.ws.js';

function mockReq(url: string): IncomingMessage {
  return { url, headers: { host: 'localhost:3000' } } as IncomingMessage;
}

describe('eebus-proxy path routing', () => {
  it('matches /ws/eebus', () => {
    expect(isEebusProxyPath(mockReq('/ws/eebus?ski=abc'))).toBe(true);
  });

  it('rejects energy websocket path', () => {
    expect(isEebusProxyPath(mockReq('/ws?ticket=abc'))).toBe(false);
  });
});
