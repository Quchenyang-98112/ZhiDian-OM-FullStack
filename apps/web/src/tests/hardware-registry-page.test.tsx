import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import HardwareRegistryPage from '../pages/HardwareRegistryPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number; defaultValue?: string }) => {
      if (opts?.count !== undefined) return `${key}:${opts.count}`;
      return opts?.defaultValue ?? key;
    },
  }),
}));

vi.mock('../components/layout/PageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock('../components/ui/PageCrossLinks', () => ({
  PageCrossLinks: () => <div data-testid="page-cross-links" />,
}));

vi.mock('../components/hardware/AddAdapterWizard', () => ({
  AddAdapterWizard: () => <div data-testid="add-adapter-wizard" />,
}));

describe('HardwareRegistryPage', () => {
  it('renders catalog stats and device cards from the hardware registry', () => {
    render(
      <MemoryRouter>
        <HardwareRegistryPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('hardwareRegistry.title');
    expect(screen.getByText('hardwareRegistry.statsDevices')).toBeInTheDocument();
    expect(screen.getAllByRole('article').length).toBeGreaterThan(0);
    expect(screen.getByTestId('page-cross-links')).toBeInTheDocument();
  });

  it('filters devices when the user types in the search field', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HardwareRegistryPage />
      </MemoryRouter>,
    );

    const initialCount = screen.getAllByRole('article').length;
    const search = screen.getByRole('searchbox');
    await user.type(search, 'zzzz-no-device-match-zzzz');

    expect(screen.queryAllByRole('article').length).toBeLessThan(initialCount);
    expect(screen.getByText('hardwareRegistry.empty')).toBeInTheDocument();
  });
});
