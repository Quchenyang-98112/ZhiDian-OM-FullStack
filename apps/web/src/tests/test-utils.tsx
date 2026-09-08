import { type RenderOptions, render } from '@testing-library/react';
import { type ReactElement, StrictMode } from 'react';

/**
 * Custom render that wraps components in React.StrictMode,
 * matching the production entry point (main.tsx).
 *
 * React 19 StrictMode double-renders in dev to surface:
 *  - Impure render functions
 *  - Missing cleanup in effects
 *  - Deprecated lifecycle methods
 */
function renderWithStrictMode(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, {
    wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
    ...options,
  });
}

// Re-export everything from @testing-library/react
// eslint-disable-next-line react-refresh/only-export-components -- test utility, not a component module
export * from '@testing-library/react';
// Override the default render with our StrictMode wrapper
export { renderWithStrictMode as render };
