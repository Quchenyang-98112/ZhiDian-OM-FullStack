import { act, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-query-devtools', () => ({
  ReactQueryDevtools: () => null,
}));

describe('Query Client Module', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('should export queryClient', async () => {
    const mod = await import('../lib/query-client');
    expect(mod.queryClient).toBeDefined();
  });

  it('should export QueryProvider component', async () => {
    const mod = await import('../lib/query-client');
    expect(typeof mod.QueryProvider).toBe('function');
  });

  it('QueryProvider renders children', async () => {
    const { QueryProvider } = await import('../lib/query-client');
    await act(async () => {
      render(createElement(QueryProvider, null, createElement('span', null, 'query-child')));
    });
    expect(screen.getByText('query-child')).toBeInTheDocument();
  });
});
