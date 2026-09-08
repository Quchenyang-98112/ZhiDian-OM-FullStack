import type { KeyboardEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  buildHelpSearchActiveOptionId,
  handleHelpSearchKeyDown,
  resolveHelpSearchActiveIndex,
} from '../lib/help-search-keyboard';

const makeKeyEvent = (key: string) => {
  const preventDefault = vi.fn();
  return {
    key,
    preventDefault,
  } as unknown as KeyboardEvent<HTMLInputElement>;
};

describe('help-search-keyboard', () => {
  const searchResults = [
    { tab: 'lexicon' as const, title: 'EEBUS', body: 'desc' },
    { tab: 'integration' as const, title: 'EEBUS setup', body: 'setup' },
  ];

  it('returns -1 when there are no search results', () => {
    expect(
      resolveHelpSearchActiveIndex([], 'eebus', { normalizedQuery: 'eebus', activeIndex: 0 }),
    ).toBe(-1);
  });

  it('resets the active index when the query changes', () => {
    expect(
      resolveHelpSearchActiveIndex(searchResults, 'eebus', {
        normalizedQuery: 'knx',
        activeIndex: 2,
      }),
    ).toBe(0);
  });

  it('clamps the active index to the current result count', () => {
    expect(
      resolveHelpSearchActiveIndex(searchResults, 'eebus', {
        normalizedQuery: 'eebus',
        activeIndex: 4,
      }),
    ).toBe(1);
  });

  it('builds the active option id only when a result is highlighted', () => {
    expect(buildHelpSearchActiveOptionId('help-search', 1, 2)).toBe('help-search-option-1');
    expect(buildHelpSearchActiveOptionId('help-search', -1, 2)).toBeUndefined();
    expect(buildHelpSearchActiveOptionId('help-search', 0, 0)).toBeUndefined();
  });

  it('dismisses the combobox on Escape when open', () => {
    const onDismiss = vi.fn();
    const event = makeKeyEvent('Escape');

    handleHelpSearchKeyDown(event, searchResults, 0, vi.fn(), vi.fn(), onDismiss, true);

    expect(onDismiss).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('ignores Escape when the combobox is closed', () => {
    const onDismiss = vi.fn();

    handleHelpSearchKeyDown(
      makeKeyEvent('Escape'),
      searchResults,
      0,
      vi.fn(),
      vi.fn(),
      onDismiss,
      false,
    );

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('moves the active index with arrow keys', () => {
    const setActiveIndex = vi.fn();

    handleHelpSearchKeyDown(
      makeKeyEvent('ArrowDown'),
      searchResults,
      0,
      setActiveIndex,
      vi.fn(),
      vi.fn(),
      true,
    );
    handleHelpSearchKeyDown(
      makeKeyEvent('ArrowUp'),
      searchResults,
      1,
      setActiveIndex,
      vi.fn(),
      vi.fn(),
      true,
    );

    expect(setActiveIndex).toHaveBeenNthCalledWith(1, 1);
    expect(setActiveIndex).toHaveBeenNthCalledWith(2, 0);
  });

  it('selects the active result on Enter', () => {
    const onSelectResult = vi.fn();
    const event = makeKeyEvent('Enter');

    handleHelpSearchKeyDown(event, searchResults, 1, vi.fn(), onSelectResult, vi.fn(), true);

    expect(onSelectResult).toHaveBeenCalledWith('integration');
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('ignores navigation keys when there are no results', () => {
    const setActiveIndex = vi.fn();

    handleHelpSearchKeyDown(
      makeKeyEvent('ArrowDown'),
      [],
      0,
      setActiveIndex,
      vi.fn(),
      vi.fn(),
      true,
    );

    expect(setActiveIndex).not.toHaveBeenCalled();
  });

  it('jumps to the first and last options with Home and End', () => {
    const setActiveIndex = vi.fn();

    handleHelpSearchKeyDown(
      makeKeyEvent('End'),
      searchResults,
      0,
      setActiveIndex,
      vi.fn(),
      vi.fn(),
      true,
    );
    handleHelpSearchKeyDown(
      makeKeyEvent('Home'),
      searchResults,
      1,
      setActiveIndex,
      vi.fn(),
      vi.fn(),
      true,
    );

    expect(setActiveIndex).toHaveBeenNthCalledWith(1, 1);
    expect(setActiveIndex).toHaveBeenNthCalledWith(2, 0);
  });

  it('ignores navigation and Enter when the combobox is closed', () => {
    const setActiveIndex = vi.fn();
    const onSelectResult = vi.fn();

    handleHelpSearchKeyDown(
      makeKeyEvent('ArrowDown'),
      searchResults,
      0,
      setActiveIndex,
      onSelectResult,
      vi.fn(),
      false,
    );
    handleHelpSearchKeyDown(
      makeKeyEvent('Enter'),
      searchResults,
      0,
      setActiveIndex,
      onSelectResult,
      vi.fn(),
      false,
    );

    expect(setActiveIndex).not.toHaveBeenCalled();
    expect(onSelectResult).not.toHaveBeenCalled();
  });
});
