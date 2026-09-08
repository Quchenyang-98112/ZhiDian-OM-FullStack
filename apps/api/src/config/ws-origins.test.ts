import { describe, expect, it } from 'vitest';
import {
  isAllowedWsOrigin,
  isValidWsOrigin,
  parseWsOrigins,
  validateWsOrigins,
} from './ws-origins.js';

describe('ws-origins', () => {
  it('parses comma-separated origins', () => {
    expect(parseWsOrigins(' wss://a.example , ws://b.local:8080 ')).toEqual([
      'wss://a.example',
      'ws://b.local:8080',
    ]);
  });

  it('accepts well-formed origins', () => {
    expect(isValidWsOrigin('wss://dashboard.example.com')).toBe(true);
    expect(isValidWsOrigin('ws://192.168.1.10:8085')).toBe(true);
  });

  it('rejects invalid schemes and characters', () => {
    expect(isValidWsOrigin('http://bad.example')).toBe(false);
    expect(isValidWsOrigin('wss://evil.com;rm -rf')).toBe(false);
  });

  it('does not throw in non-production', () => {
    expect(() =>
      validateWsOrigins({ NODE_ENV: 'development', WS_ORIGINS: 'not-valid' }),
    ).not.toThrow();
  });

  it('throws in production on invalid origin', () => {
    expect(() => validateWsOrigins({ NODE_ENV: 'production', WS_ORIGINS: 'ftp://bad' })).toThrow(
      /Invalid WebSocket origin/,
    );
  });

  it('allows empty WS_ORIGINS in production', () => {
    expect(() => validateWsOrigins({ NODE_ENV: 'production', WS_ORIGINS: '' })).not.toThrow();
  });

  describe('isAllowedWsOrigin (CSWSH)', () => {
    const allow = parseWsOrigins('wss://dashboard.example.com, ws://192.168.1.10:8085');

    it('matches a browser https Origin against a wss allowlist entry (scheme family)', () => {
      // Browser sends the page origin (https://), allowlist holds the socket origin (wss://).
      expect(isAllowedWsOrigin('https://dashboard.example.com', allow)).toBe(true);
    });

    it('treats an explicit default port as equal to none', () => {
      expect(isAllowedWsOrigin('https://dashboard.example.com:443', allow)).toBe(true);
    });

    it('matches host:port for a non-default port', () => {
      expect(isAllowedWsOrigin('http://192.168.1.10:8085', allow)).toBe(true);
    });

    it('rejects a foreign origin', () => {
      expect(isAllowedWsOrigin('https://evil.example.com', allow)).toBe(false);
    });

    it('rejects a host match on the wrong port', () => {
      expect(isAllowedWsOrigin('http://192.168.1.10:9999', allow)).toBe(false);
    });

    it('rejects an empty or unparseable origin', () => {
      expect(isAllowedWsOrigin('', allow)).toBe(false);
      expect(isAllowedWsOrigin('not a url', allow)).toBe(false);
    });

    it('rejects everything against an empty allowlist', () => {
      expect(isAllowedWsOrigin('https://dashboard.example.com', [])).toBe(false);
    });
  });
});
