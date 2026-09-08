import { beforeEach, describe, expect, it } from 'vitest';

import { getAIMode, getPreferredLocalModel } from '../core/aiClient';

// The shipped defaults are privacy-first and local-only: no cloud provider and
// no model download until the user opts in. See PR9 / docs plan.
describe('aiClient defaults', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults the execution mode to eco (deterministic local heuristics, no network)', () => {
    expect(getAIMode()).toBe('eco');
  });

  it('defaults the preferred local model to heuristic (no WebGPU/model download)', () => {
    expect(getPreferredLocalModel()).toBe('heuristic');
  });
});
