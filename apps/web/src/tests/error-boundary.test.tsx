import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('i18next', () => ({
  default: {
    t: (key: string) => key,
  },
}));

import { ErrorBoundary } from '../components/ErrorBoundary';

vi.mock('../lib/sentry', () => ({
  Sentry: { withScope: vi.fn(), captureException: vi.fn() },
  sentryEnabled: false,
}));

function Boom(): null {
  throw new Error('component exploded');
}

function ConditionalBoom({ crash }: { crash: boolean }): React.ReactNode {
  if (crash) throw new Error('component exploded');
  return <p>Recovered</p>;
}

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('renders a custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<p>Custom fallback</p>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Custom fallback')).toBeInTheDocument();
  });

  it('shows the default recovery UI and resets after an error', async () => {
    const onError = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { rerender } = render(
      <ErrorBoundary onError={onError}>
        <ConditionalBoom crash />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('button', { name: 'error.reload' })).toBeInTheDocument();
    expect(onError).toHaveBeenCalled();

    screen.getByRole('button', { name: 'error.tryAgain' }).click();
    rerender(
      <ErrorBoundary onError={onError}>
        <ConditionalBoom crash={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Recovered')).toBeInTheDocument();

    consoleError.mockRestore();
  });

  it('reveals developer error details inside the nested disclosure', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();

    render(
      <ErrorBoundary>
        <ConditionalBoom crash />
      </ErrorBoundary>,
    );

    await user.click(screen.getByRole('button', { name: 'error.details' }));
    expect(screen.getByText('component exploded')).toBeInTheDocument();
    expect(screen.getByText('error.stack')).toBeInTheDocument();

    consoleError.mockRestore();
  });
});
