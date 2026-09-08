/**
 * jwt-secret-enforcement.test.ts — CRIT-03: production-fatal JWT secret hygiene.
 *
 * In production, `checkSecretEntropy` must ABORT boot (throw) on a known-weak
 * pattern or on estimated entropy < 128 bits, while a merely short (but strong)
 * secret stays a non-fatal warning. In dev/test every condition is warn-only.
 *
 * Also asserts thrown messages never leak the secret, its length, or entropy.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Keep module init side effects out of the way; this file imports jwt-utils lazily.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-for-unit-tests-that-is-long-enough-for-hs256-algo';

const { checkSecretEntropy } = await import('../jwt-utils.js');

// Readable, obviously-fake fixtures (no real credential, so secret scanners stay
// quiet) whose length/charset still satisfy the charset-based entropy heuristic.
// 66 chars, mixed charset, no weak word, length ≥ 64: passes with no warning.
const STRONG_SECRET = 'nexus-hems-dash-strong-jwt-fixture-signing-key-long-enough-hs256-x';
// Weak by dictionary pattern (contains "changeme"), still ≥32 chars.
const WEAK_PATTERN_SECRET = 'changeme-changeme-changeme-9999-abcdef';
// Low entropy: 20 lowercase chars → 20·log2(26) ≈ 94 bits < 128.
const LOW_ENTROPY_SECRET = 'abcdefghijklmnopqrst';
// 44 chars: entropy well over 128 (no throw) but length < 64 (warns).
const SHORT_STRONG_SECRET = 'nexus-hems-dash-short-strong-jwt-fixture-key';

describe('checkSecretEntropy — production enforcement (CRIT-03)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('throws on a known-weak pattern in production', () => {
    expect(() => checkSecretEntropy(WEAK_PATTERN_SECRET, 'JWT_SECRET', true)).toThrow(
      /known-weak pattern/i,
    );
  });

  it('throws on low entropy in production', () => {
    expect(() => checkSecretEntropy(LOW_ENTROPY_SECRET, 'JWT_SECRET', true)).toThrow(
      /insufficient entropy/i,
    );
  });

  it('does NOT throw on a short-but-strong secret in production (length is advisory)', () => {
    expect(() => checkSecretEntropy(SHORT_STRONG_SECRET, 'JWT_SECRET', true)).not.toThrow();
    // But it should still emit the length warning.
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/shorter than the recommended/i));
  });

  it('does NOT throw on a strong 64+ char secret in production', () => {
    expect(() => checkSecretEntropy(STRONG_SECRET, 'JWT_SECRET', true)).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('checkSecretEntropy — dev/test is warn-only (never throws)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('warns (does not throw) on a known-weak pattern outside production', () => {
    expect(() => checkSecretEntropy(WEAK_PATTERN_SECRET, 'JWT_SECRET', false)).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/known-weak pattern/i));
  });

  it('warns (does not throw) on low entropy outside production', () => {
    expect(() => checkSecretEntropy(LOW_ENTROPY_SECRET, 'JWT_SECRET', false)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/low entropy/i));
  });
});

describe('checkSecretEntropy — no secret material leaks in thrown messages', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('weak-pattern throw does not include the secret or its length', () => {
    let message = '';
    try {
      checkSecretEntropy(WEAK_PATTERN_SECRET, 'JWT_SECRET', true);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).not.toContain(WEAK_PATTERN_SECRET);
    expect(message).not.toContain('changeme');
    expect(message).not.toContain(String(WEAK_PATTERN_SECRET.length));
  });

  it('low-entropy throw does not include the secret or the entropy value', () => {
    let message = '';
    try {
      checkSecretEntropy(LOW_ENTROPY_SECRET, 'JWT_SECRET', true);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).not.toContain(LOW_ENTROPY_SECRET);
    // Entropy for this secret rounds to ~94; ensure no such derived number is present.
    expect(message).not.toMatch(/\b9[0-9]\b/);
  });
});
