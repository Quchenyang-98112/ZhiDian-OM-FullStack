import { describe, expect, it } from 'vitest';
import {
  getSectionLabelKey,
  shouldVirtualizeCommandList,
  shouldVirtualizeCommandListForEnv,
} from './command-palette-list-utils';

describe('getSectionLabelKey', () => {
  it('maps ai section to command.categoryAi', () => {
    expect(getSectionLabelKey('ai')).toBe('command.categoryAi');
  });
});

describe('shouldVirtualizeCommandList', () => {
  it('skips virtualization in Vitest/jsdom', () => {
    expect(shouldVirtualizeCommandList(50)).toBe(false);
  });

  it('skips virtualization for short lists', () => {
    expect(shouldVirtualizeCommandList(10)).toBe(false);
    expect(shouldVirtualizeCommandList(20)).toBe(false);
  });

  it('enables virtualization for long lists outside Vitest', () => {
    expect(shouldVirtualizeCommandListForEnv(25, false)).toBe(true);
    expect(shouldVirtualizeCommandListForEnv(25, true)).toBe(false);
    expect(shouldVirtualizeCommandListForEnv(20, false)).toBe(false);
  });
});
