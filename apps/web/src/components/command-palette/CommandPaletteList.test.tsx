import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ResolvedCommand } from '../../core/commands/types';

const mockScrollToIndex = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({
    count,
    estimateSize,
  }: {
    count: number;
    estimateSize: (index: number) => number;
  }) => ({
    getTotalSize: () =>
      Array.from({ length: count }, (_, index) => estimateSize(index)).reduce((a, b) => a + b, 0),
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        key: String(index),
        index,
        start: index * estimateSize(index),
        size: estimateSize(index),
      })),
    scrollToIndex: mockScrollToIndex,
    measureElement: vi.fn(),
  }),
}));

vi.mock('./command-palette-list-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./command-palette-list-utils')>();
  return {
    ...actual,
    shouldVirtualizeCommandList: () => true,
  };
});

import { CommandPaletteList } from './CommandPaletteList';

function mockCommand(id: string): ResolvedCommand {
  return {
    id,
    labelKey: id,
    label: id,
    category: 'action',
    risk: 'safe',
    source: 'core',
    score: 1,
    disabled: false,
    isFavorite: false,
    section: 'action',
    execute: vi.fn(),
  };
}

describe('CommandPaletteList', () => {
  it('renders empty state when no commands match', () => {
    render(
      <CommandPaletteList
        commands={[]}
        selectedIndex={0}
        query="test"
        onSelect={vi.fn()}
        onHover={vi.fn()}
      />,
    );
    expect(screen.getByText('command.noResults')).toBeInTheDocument();
  });

  it('renders virtualized rows and scrolls selection into view', () => {
    const commands = Array.from({ length: 25 }, (_, index) => mockCommand(`cmd-${index}`));
    const onSelect = vi.fn();

    const { rerender } = render(
      <CommandPaletteList
        commands={commands}
        selectedIndex={0}
        query=""
        onSelect={onSelect}
        onHover={vi.fn()}
      />,
    );

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);

    rerender(
      <CommandPaletteList
        commands={commands}
        selectedIndex={3}
        query=""
        onSelect={onSelect}
        onHover={vi.fn()}
      />,
    );
    expect(mockScrollToIndex).toHaveBeenCalled();

    const [firstOption] = screen.getAllByRole('option');
    if (!firstOption) {
      throw new Error('expected at least one command option');
    }
    fireEvent.click(firstOption);
    expect(onSelect).toHaveBeenCalled();
  });
});
