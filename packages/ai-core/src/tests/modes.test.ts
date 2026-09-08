import { describe, expect, it } from 'vitest';
import { buildStrategy, resolveEffectiveMode } from '../modes.ts';
import type { AICapabilityReport, AIExecutionMode } from '../types.ts';

function makeCaps(overrides?: Partial<AICapabilityReport>): AICapabilityReport {
  return {
    webgpu: false,
    webgl: false,
    webAssembly: true,
    simd: false,
    threads: false,
    hardwareConcurrency: 4,
    deviceMemoryGb: 8,
    estimatedGpuMemoryMb: undefined,
    indexedDb: true,
    localStorage: true,
    recommendedMode: 'hybrid',
    canRunLargeLocalModel: true,
    canRunSmallLocalModel: true,
    canRunOnnx: true,
    ...overrides,
  };
}

describe('buildStrategy', () => {
  it('prefers local chain in local mode', () => {
    const strategy = buildStrategy('local', makeCaps(), false);
    expect(strategy.mode).toBe('local');
    expect(strategy.fallbackChain[0]).toBe('webllm');
  });

  it('uses cloud chain when a key exists in hybrid mode', () => {
    const strategy = buildStrategy('hybrid', makeCaps(), true);
    expect(strategy.mode).toBe('hybrid');
    expect(strategy.fallbackChain).toContain('openai');
    expect(strategy.fallbackChain).toContain('webllm');
  });

  it('falls back to empty chain in cloud mode without keys', () => {
    const strategy = buildStrategy('cloud', makeCaps(), false);
    expect(strategy.mode).toBe('cloud');
    expect(strategy.fallbackChain).toEqual([]);
  });

  it('prefers heuristic in eco mode', () => {
    const strategy = buildStrategy('eco', makeCaps(), true);
    expect(strategy.mode).toBe('eco');
    expect(strategy.fallbackChain[0]).toBe('heuristic');
  });
});

describe('resolveEffectiveMode', () => {
  it('returns cloud when requested cloud and key exists', () => {
    expect(resolveEffectiveMode('cloud', makeCaps(), true)).toBe('cloud');
  });

  it('falls back to eco when cloud requested without key', () => {
    expect(resolveEffectiveMode('cloud', makeCaps(), false)).toBe('eco');
  });

  it('falls back to cloud when local requested but unsupported', () => {
    const caps = makeCaps({ canRunSmallLocalModel: false, canRunLargeLocalModel: false });
    expect(resolveEffectiveMode('local', caps, true)).toBe('cloud');
  });

  it('returns recommended mode for hybrid', () => {
    expect(resolveEffectiveMode('hybrid', makeCaps({ recommendedMode: 'local' }), false)).toBe(
      'local',
    );
  });

  it('returns eco for eco regardless of capabilities', () => {
    expect(resolveEffectiveMode('eco' as AIExecutionMode, makeCaps(), false)).toBe('eco');
  });
});
