import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Disclosure } from '../components/ui/Disclosure';

describe('Disclosure', () => {
  it('toggles uncontrolled content and calls onOpenChange', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Disclosure title="Section" subtitle="Details" defaultOpen onOpenChange={onOpenChange}>
        <p>Hidden body</p>
      </Disclosure>,
    );

    expect(screen.getByText('Hidden body')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /section/i }));
    await waitFor(() => {
      expect(screen.queryByText('Hidden body')).not.toBeInTheDocument();
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('respects controlled open state and disabled triggers', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <Disclosure title="Locked" open={false} onOpenChange={onOpenChange} disabled>
        <p>Controlled body</p>
      </Disclosure>,
    );

    expect(screen.queryByText('Controlled body')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /locked/i }));
    expect(onOpenChange).not.toHaveBeenCalled();

    rerender(
      <Disclosure title="Locked" open actions={<button type="button">Action</button>}>
        <p>Controlled body</p>
      </Disclosure>,
    );
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
    expect(screen.getByText('Controlled body')).toBeInTheDocument();
  });

  it('renders nested variant with a leading icon', () => {
    render(
      <Disclosure title="Nested" variant="nested" icon={<span data-testid="icon">*</span>}>
        <p>Nested content</p>
      </Disclosure>,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(document.querySelector('.disclosure-panel--nested')).not.toBeNull();
  });
});
