import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import NotFoundPage from '../pages/NotFoundPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

describe('NotFoundPage', () => {
  it('renders the 404 heading and dashboard link', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('404 – Page not found');
    expect(screen.getByRole('link', { name: /go to dashboard/i })).toHaveAttribute('href', '/');
    expect(screen.getByText(/requested page could not be found/i)).toBeInTheDocument();
  });
});
