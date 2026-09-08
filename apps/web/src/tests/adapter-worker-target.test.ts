import { describe, expect, it } from 'vitest';
import type { PollTarget } from '../core/adapter-worker';
import { normalizePollTarget } from '../core/useAdapterWorker';

describe('normalizePollTarget', () => {
  it('parses a plain http URL into a structured target', () => {
    expect(normalizePollTarget('http://192.168.1.50/api/modbus/sunspec')).toEqual({
      protocol: 'http',
      host: '192.168.1.50',
      port: undefined,
      path: '/api/modbus/sunspec',
      query: undefined,
    });
  });

  it('preserves https, explicit port and query parameters', () => {
    expect(normalizePollTarget('https://gateway.local:8443/sunspec?model=inverter&unit=1')).toEqual(
      {
        protocol: 'https',
        host: 'gateway.local',
        port: 8443,
        path: '/sunspec',
        query: { model: 'inverter', unit: '1' },
      },
    );
  });

  it('passes a pre-structured PollTarget through unchanged', () => {
    const target: PollTarget = { protocol: 'http', host: 'nas', path: '/x' };
    expect(normalizePollTarget(target)).toBe(target);
  });

  it.each([
    'file:///etc/passwd',
    'ftp://192.168.1.1/x',
    'javascript:alert(1)',
    'data:text/html,<script>',
    'ws://192.168.1.50/socket',
  ])('rejects non-http(s) scheme %s (SSRF defence)', (url) => {
    expect(normalizePollTarget(url)).toBeNull();
  });

  it.each([
    'not a url',
    '',
    '://missing-scheme',
    'http://',
  ])('returns null for unparseable input %j', (bad) => {
    expect(normalizePollTarget(bad)).toBeNull();
  });
});
