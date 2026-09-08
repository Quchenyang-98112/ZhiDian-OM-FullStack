import { describe, expect, it } from 'vitest';
import { stripLocalhostWsOrigins } from '../../vite.csp';

// The connect-src as shipped in the static index.html shell (dev form).
const DEV_CSP =
  "connect-src 'self' wss://localhost:* ws://localhost:* wss://127.0.0.1:* ws://127.0.0.1:* https://api.tibber.com https://api.anthropic.com; worker-src 'self'";

describe('stripLocalhostWsOrigins (production CSP shell)', () => {
  it('removes every localhost / 127.0.0.1 WebSocket origin', () => {
    const out = stripLocalhostWsOrigins(DEV_CSP);
    expect(out).not.toMatch(/localhost/);
    expect(out).not.toMatch(/127\.0\.0\.1/);
  });

  it('preserves non-WS allowlisted origins and self', () => {
    const out = stripLocalhostWsOrigins(DEV_CSP);
    expect(out).toContain("'self'");
    expect(out).toContain('https://api.tibber.com');
    expect(out).toContain('https://api.anthropic.com');
    expect(out).toContain("worker-src 'self'");
  });

  it('is idempotent and safe when no localhost origins are present', () => {
    const prod = "connect-src 'self' https://api.tibber.com";
    expect(stripLocalhostWsOrigins(prod)).toBe(prod);
    expect(stripLocalhostWsOrigins(stripLocalhostWsOrigins(DEV_CSP))).toBe(
      stripLocalhostWsOrigins(DEV_CSP),
    );
  });
});
