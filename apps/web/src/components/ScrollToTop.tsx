import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Scrolls to top and moves focus to main content on SPA route changes.
 *
 * Skips the focus move on the initial render so the first paint is not disrupted.
 */
export const ScrollToTop = () => {
  const { pathname } = useLocation();
  const initialRender = useRef(true);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (initialRender.current) {
      initialRender.current = false;
      return undefined;
    }
    document.getElementById('main-content')?.focus({ preventScroll: true });
    return undefined;
  }, [pathname]);

  return null;
};
