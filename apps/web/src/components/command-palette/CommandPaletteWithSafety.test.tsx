import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockExecute = vi.fn();

vi.mock('../../core/useSafeCommand', () => ({
  useSafeCommand: () => ({
    execute: mockExecute,
    ConfirmationDialog: () => <div data-testid="safe-command-dialog" />,
  }),
}));

vi.mock('./CommandPalette', () => ({
  CommandPalette: ({
    executeHardwareCommand,
  }: {
    executeHardwareCommand?: (command: unknown) => void;
  }) => (
    <div data-testid="command-palette" data-has-bridge={String(Boolean(executeHardwareCommand))} />
  ),
}));

import { CommandPaletteWithSafety } from './CommandPaletteWithSafety';

describe('CommandPaletteWithSafety', () => {
  it('wires useSafeCommand execute into CommandPalette', () => {
    render(<CommandPaletteWithSafety isOpen onClose={vi.fn()} />);
    expect(screen.getByTestId('command-palette')).toHaveAttribute('data-has-bridge', 'true');
    expect(screen.getByTestId('safe-command-dialog')).toBeInTheDocument();
  });
});
