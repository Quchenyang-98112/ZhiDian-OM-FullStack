import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, type ReactNode, Suspense } from 'react';

const ReactQueryDevtools =
  import.meta.env.DEV && import.meta.env.VITE_SHOW_DEVTOOLS === 'true'
    ? lazy(() =>
        import('@tanstack/react-query-devtools').then((m) => ({ default: m.ReactQueryDevtools })),
      )
    : () => null;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Live energy data updates arrive via Zustand (WebSocket/MQTT),
      // not via React Query. Queries here are for tariff, weather, and
      // AI APIs — stale after 10 min, cached for 1 hour.
      staleTime: 1000 * 60 * 10, // 10 minutes
      gcTime: 1000 * 60 * 60, // 1 hour
      retry: 2,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      // Structural sharing keeps stable object references when query
      // data hasn't changed — prevents unnecessary re-renders.
      structuralSharing: true,
    },
  },
});

// eslint-disable-next-line react-refresh/only-export-components
export { queryClient };

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Suspense>
        <ReactQueryDevtools initialIsOpen={false} />
      </Suspense>
    </QueryClientProvider>
  );
}
