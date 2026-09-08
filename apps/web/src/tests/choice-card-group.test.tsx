import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChoiceCardGroup } from '../components/ui/ChoiceCardGroup';

vi.mock('../lib/haptics', () => ({
  hapticClick: vi.fn(),
}));

describe('ChoiceCardGroup', () => {
  const options = [
    { value: 'mock', label: 'Mock', description: 'Safe simulation', tone: 'success' as const },
    {
      value: 'live',
      label: 'Live',
      description: 'Real hardware',
      tone: 'danger' as const,
      badge: 'Beta',
    },
  ];

  it('selects options in stack layout and calls onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ChoiceCardGroup
        name="adapter-mode"
        value="mock"
        options={options}
        onChange={onChange}
        aria-label="Adapter mode"
      />,
    );

    await user.click(screen.getByRole('radio', { name: /live/i }));
    expect(onChange).toHaveBeenCalledWith('live');
  });

  it('renders grid compact layout and ignores clicks when disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ChoiceCardGroup
        name="profile"
        value="mock"
        options={options}
        onChange={onChange}
        layout="grid"
        size="compact"
        disabled
        aria-label="Profile"
      />,
    );

    await user.click(screen.getByRole('radio', { name: /live/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows descriptions, icons, and meta in the default layout', () => {
    render(
      <ChoiceCardGroup
        name="tone"
        value="primary"
        options={[
          {
            value: 'primary',
            label: 'Primary',
            description: 'Default tone',
            icon: <span data-testid="icon">*</span>,
            meta: 'Recommended',
            tone: 'primary',
          },
          {
            value: 'warning',
            label: 'Warning',
            description: 'Caution tone',
            tone: 'warning',
          },
        ]}
        aria-label="Tone"
      />,
    );

    expect(screen.getByText('Default tone')).toBeInTheDocument();
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.getByText('Recommended')).toBeInTheDocument();
  });
});
