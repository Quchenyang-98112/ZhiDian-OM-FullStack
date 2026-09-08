import type { KeyboardEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createHelpTabKeyHandler } from '../lib/help-tab-keyboard';

describe('createHelpTabKeyHandler', () => {
  const tabs = [{ key: 'a' as const }, { key: 'b' as const }, { key: 'c' as const }];

  it('wraps forward on ArrowRight', () => {
    const selectTab = vi.fn();
    const handler = createHelpTabKeyHandler(tabs, 'c', selectTab);
    const preventDefault = vi.fn();
    const focus = vi.fn();
    vi.spyOn(document, 'getElementById').mockReturnValue({ focus } as unknown as HTMLElement);

    handler({
      key: 'ArrowRight',
      preventDefault,
    } as unknown as KeyboardEvent<HTMLDivElement>);

    expect(preventDefault).toHaveBeenCalled();
    expect(selectTab).toHaveBeenCalledWith('a');
    expect(focus).toHaveBeenCalled();
  });

  it('ignores unrelated keys', () => {
    const selectTab = vi.fn();
    const handler = createHelpTabKeyHandler(tabs, 'b', selectTab);

    handler({
      key: 'Enter',
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent<HTMLDivElement>);

    expect(selectTab).not.toHaveBeenCalled();
  });

  it('moves to the previous tab on ArrowLeft', () => {
    const selectTab = vi.fn();
    const handler = createHelpTabKeyHandler(tabs, 'b', selectTab);
    const preventDefault = vi.fn();
    vi.spyOn(document, 'getElementById').mockReturnValue({
      focus: vi.fn(),
    } as unknown as HTMLElement);

    handler({
      key: 'ArrowLeft',
      preventDefault,
    } as unknown as KeyboardEvent<HTMLDivElement>);

    expect(selectTab).toHaveBeenCalledWith('a');
  });

  it('moves upward with ArrowUp', () => {
    const selectTab = vi.fn();
    const handler = createHelpTabKeyHandler(tabs, 'b', selectTab);
    handler({
      key: 'ArrowUp',
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent<HTMLDivElement>);
    expect(selectTab).toHaveBeenCalledWith('a');
  });

  it('jumps to the first tab on Home', () => {
    const selectTab = vi.fn();
    const handler = createHelpTabKeyHandler(tabs, 'c', selectTab);
    handler({
      key: 'Home',
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent<HTMLDivElement>);
    expect(selectTab).toHaveBeenCalledWith('a');
  });

  it('moves downward with ArrowDown', () => {
    const selectTab = vi.fn();
    const handler = createHelpTabKeyHandler(tabs, 'a', selectTab);
    handler({
      key: 'ArrowDown',
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent<HTMLDivElement>);
    expect(selectTab).toHaveBeenCalledWith('b');
  });

  it('jumps to the last tab on End', () => {
    const selectTab = vi.fn();
    const handler = createHelpTabKeyHandler(tabs, 'a', selectTab);
    handler({
      key: 'End',
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent<HTMLDivElement>);
    expect(selectTab).toHaveBeenCalledWith('c');
  });

  it('ignores keyboard events for unknown tabs', () => {
    const selectTab = vi.fn();
    const handler = createHelpTabKeyHandler(tabs, 'missing' as 'a', selectTab);
    handler({
      key: 'ArrowRight',
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent<HTMLDivElement>);
    expect(selectTab).not.toHaveBeenCalled();
  });
});
