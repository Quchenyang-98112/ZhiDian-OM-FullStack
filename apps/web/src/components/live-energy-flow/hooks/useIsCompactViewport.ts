import { useSyncExternalStore } from 'react';

// Below Tailwind's md breakpoint the absolutely-positioned floating panels would
// land off-screen, so we switch to a stacked bottom sheet instead.
const QUERY = '(max-width: 767px)';

function subscribe(callback: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

/** True on phone-width viewports where floating device panels would fall off-screen. */
export function useIsCompactViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
