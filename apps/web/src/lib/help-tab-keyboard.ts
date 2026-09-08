import type { KeyboardEvent } from 'react';

/**
 * Returns a roving-tab keyboard handler for horizontal/vertical Help tab lists.
 */
export const createHelpTabKeyHandler = <T extends string>(
  tabs: { key: T }[],
  activeTab: T,
  selectTab: (tab: T) => void,
) => {
  return (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = tabs.findIndex((tab) => tab.key === activeTab);
    if (currentIndex < 0) return;

    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    selectTab(tabs[nextIndex].key);
    document.getElementById(`help-tab-${tabs[nextIndex].key}`)?.focus();
  };
};
