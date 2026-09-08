import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog, useConfirmDialog } from '../components/ConfirmDialog';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

describe('ConfirmDialog', () => {
  it('renders danger and warning variants and confirms successfully', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    const { rerender } = render(
      <ConfirmDialog
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete adapter"
        message="This cannot be undone."
        variant="danger"
        confirmText="Delete"
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Delete adapter' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();

    rerender(
      <ConfirmDialog
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        title="Warning"
        message={<span>Check settings</span>}
        variant="warning"
        loading
      />,
    );
    expect(screen.getByText('Processing...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Processing...' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('keeps the dialog open when confirmation fails', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onConfirm = vi.fn().mockRejectedValue(new Error('network'));

    render(
      <ConfirmDialog
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        title="Apply change"
        message="Proceed?"
        variant="info"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onClose).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('closes via the cancel button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <ConfirmDialog
        isOpen
        onClose={onClose}
        onConfirm={vi.fn()}
        title="Cancel me"
        message="Body"
        cancelText="Abort"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Abort' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('useConfirmDialog', () => {
  it('opens and closes programmatically', () => {
    const { result } = renderHook(() => useConfirmDialog());
    expect(result.current.isOpen).toBe(false);

    act(() => {
      result.current.openDialog({
        title: 'Title',
        message: 'Body',
        onConfirm: vi.fn(),
      });
    });
    expect(result.current.isOpen).toBe(true);
    expect(result.current.dialogProps.title).toBe('Title');

    act(() => {
      result.current.closeDialog();
    });
    expect(result.current.isOpen).toBe(false);
  });
});
