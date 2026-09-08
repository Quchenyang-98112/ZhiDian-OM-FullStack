import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { buildAllowedPollUrl, isPrivateIPv4, sanitizePollHeaders } from '../core/adapter-worker';
import { OpenEMSAdapter } from '../core/adapters/OpenEMSAdapter';

const BLOCKED_HEADER_NAMES = new Set([
  'connection',
  'content-length',
  'cookie',
  'host',
  'origin',
  'proxy-authorization',
  'proxy-authenticate',
  'referer',
  'set-cookie',
  'transfer-encoding',
  'upgrade',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
]);

const SAFE_COMPONENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const publicIpv4Arbitrary = fc
  .tuple(
    fc.integer({ min: 1, max: 223 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 1, max: 254 }),
  )
  .map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`)
  .filter((host) => !isPrivateIPv4(host));

describe('Security fuzz', () => {
  it('never returns blocked or control-character headers after sanitization', () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 40 }),
          fc.string({ minLength: 0, maxLength: 120 }),
        ),
        (headers) => {
          const sanitized = sanitizePollHeaders(headers);
          if (!sanitized) return true;

          return Object.entries(sanitized).every(([name, value]) => {
            return (
              !BLOCKED_HEADER_NAMES.has(name.toLowerCase()) &&
              !/[\r\n\0]/.test(name) &&
              !/[\r\n\0]/.test(value)
            );
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  it('never allows structured poll targets to public IPv4 addresses', () => {
    fc.assert(
      fc.property(publicIpv4Arbitrary, fc.constantFrom('http', 'https'), (host, protocol) => {
        const url = buildAllowedPollUrl({
          protocol,
          host,
          port: 8080,
          path: '/api/modbus/sunspec',
        });

        return url === null;
      }),
      { numRuns: 100 },
    );
  });

  it('never forwards malformed OpenEMS component ids to RPC', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 80 })
          .filter((value) => !SAFE_COMPONENT_ID.test(value)),
        async (componentId) => {
          const adapter = new OpenEMSAdapter();
          const rpcCall = vi.fn().mockResolvedValue({ jsonrpc: '2.0', id: 'rpc-fuzz' });

          (adapter as unknown as { rpcCall: typeof rpcCall }).rpcCall = rpcCall;

          const ok = await adapter.updateControllerConfig(componentId, [
            { name: 'mode', value: 'CHARGE_GRID' },
          ]);

          expect(ok).toBe(false);
          expect(rpcCall).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 50 },
    );
  });
});
